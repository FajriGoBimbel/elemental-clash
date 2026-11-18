package com.wahanacreative.elementalclash;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Soket jaringan lokal untuk Main Bareng (tanpa ketergantungan Android agar bisa diuji di JVM biasa).
 * UDP: penemuan host (siaran) dan input 60x/detik. TCP: pesan sesi, satu baris JSON per pesan.
 * Semua operasi tulis berjalan di thread latar; peristiwa masuk dikirim lewat Listener.
 */
public class LanCore {
    public interface Listener {
        void onUdp(String host, int port, String data);
        void onOpen(int id, String host);
        void onData(int id, String data);
        void onClose(int id);
    }

    private final Listener listener;
    private final ExecutorService tx = Executors.newSingleThreadExecutor();
    private final Map<Integer, Socket> conns = new ConcurrentHashMap<>();
    private final AtomicInteger nextId = new AtomicInteger(1);
    private volatile DatagramSocket udp;
    private volatile ServerSocket server;

    public LanCore(Listener l) { listener = l; }

    public synchronized int udpBind(int port) throws IOException {
        if (udp != null) udp.close();
        DatagramSocket s = new DatagramSocket(null);
        s.setReuseAddress(true);
        s.setBroadcast(true);
        s.bind(new InetSocketAddress(port));
        udp = s;
        Thread t = new Thread(() -> {
            byte[] buf = new byte[4096];
            while (!s.isClosed()) {
                try {
                    DatagramPacket p = new DatagramPacket(buf, buf.length);
                    s.receive(p);
                    listener.onUdp(p.getAddress().getHostAddress(), p.getPort(), new String(p.getData(), 0, p.getLength(), StandardCharsets.UTF_8));
                } catch (IOException e) { if (s.isClosed()) break; }
            }
        }, "lan-udp");
        t.setDaemon(true);
        t.start();
        return s.getLocalPort();
    }

    /** host "*" = siaran ke alamat broadcast semua antarmuka (Wi-Fi, hotspot) + 255.255.255.255. */
    public void udpSend(String host, int port, String data) {
        final DatagramSocket s = udp;
        if (s == null) return;
        tx.execute(() -> {
            byte[] b = data.getBytes(StandardCharsets.UTF_8);
            try {
                List<InetAddress> to = "*".equals(host) ? broadcastAddrs() : Collections.singletonList(InetAddress.getByName(host));
                for (InetAddress a : to) {
                    try { s.send(new DatagramPacket(b, b.length, a, port)); } catch (IOException ignored) { }
                }
            } catch (IOException ignored) { }
        });
    }

    static List<InetAddress> broadcastAddrs() {
        List<InetAddress> out = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                    InetAddress b = ia.getBroadcast();
                    if (b != null && !out.contains(b)) out.add(b);
                }
            }
            InetAddress all = InetAddress.getByName("255.255.255.255");
            if (!out.contains(all)) out.add(all);
        } catch (IOException ignored) { }
        return out;
    }

    public synchronized void tcpListen(int port) throws IOException {
        if (server != null) server.close();
        ServerSocket ss = new ServerSocket();
        ss.setReuseAddress(true);
        ss.bind(new InetSocketAddress(port));
        server = ss;
        Thread t = new Thread(() -> {
            while (!ss.isClosed()) {
                try { adopt(ss.accept()); } catch (IOException e) { if (ss.isClosed()) break; }
            }
        }, "lan-accept");
        t.setDaemon(true);
        t.start();
    }

    /** Memblokir sampai tersambung; panggil dari thread latar. */
    public int tcpConnect(String host, int port, int timeoutMs) throws IOException {
        Socket s = new Socket();
        s.connect(new InetSocketAddress(host, port), timeoutMs);
        return adopt(s);
    }

    private int adopt(Socket s) throws IOException {
        s.setTcpNoDelay(true);
        s.setKeepAlive(true);
        int id = nextId.getAndIncrement();
        conns.put(id, s);
        listener.onOpen(id, s.getInetAddress().getHostAddress());
        Thread t = new Thread(() -> {
            try (BufferedReader r = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) listener.onData(id, line);
            } catch (IOException ignored) {
            } finally { drop(id); }
        }, "lan-tcp-" + id);
        t.setDaemon(true);
        t.start();
        return id;
    }

    public void tcpSend(int id, String data) {
        tx.execute(() -> {
            Socket s = conns.get(id);
            if (s == null) return;
            try {
                OutputStream o = s.getOutputStream();
                o.write((data + "\n").getBytes(StandardCharsets.UTF_8));
                o.flush();
            } catch (IOException e) { drop(id); }
        });
    }

    public void tcpClose(int id) { drop(id); }

    private void drop(int id) {
        Socket s = conns.remove(id);
        if (s == null) return;
        try { s.close(); } catch (IOException ignored) { }
        listener.onClose(id);
    }

    public synchronized void closeAll() {
        for (Integer id : new ArrayList<>(conns.keySet())) drop(id);
        try { if (server != null) server.close(); } catch (IOException ignored) { }
        if (udp != null) udp.close();
        server = null;
        udp = null;
    }
}
