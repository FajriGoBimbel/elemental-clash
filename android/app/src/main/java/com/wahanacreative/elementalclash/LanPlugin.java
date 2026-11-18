package com.wahanacreative.elementalclash;

import android.content.Context;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Jembatan Capacitor ke LanCore. Semua peristiwa dikirim ke JS sebagai event "net". */
@CapacitorPlugin(name = "Lan")
public class LanPlugin extends Plugin implements LanCore.Listener {
    private LanCore core;
    private WifiManager.MulticastLock lock;
    private final ExecutorService bg = Executors.newCachedThreadPool();

    @Override
    public void load() { core = new LanCore(this); }

    @PluginMethod
    public void info(PluginCall call) {
        String name = null;
        try { name = Settings.Global.getString(getContext().getContentResolver(), "device_name"); } catch (Exception ignored) { }
        if (name == null || name.isEmpty()) name = Build.MANUFACTURER + " " + Build.MODEL;
        JSObject r = new JSObject();
        r.put("name", name);
        call.resolve(r);
    }

    @PluginMethod
    public void udpBind(PluginCall call) {
        int port = call.getInt("port", 0);
        bg.execute(() -> {
            try {
                acquireLock();
                JSObject r = new JSObject();
                r.put("port", core.udpBind(port));
                call.resolve(r);
            } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        });
    }

    @PluginMethod
    public void udpSend(PluginCall call) {
        core.udpSend(call.getString("host", "*"), call.getInt("port", 0), call.getString("data", ""));
        call.resolve();
    }

    @PluginMethod
    public void tcpListen(PluginCall call) {
        int port = call.getInt("port", 0);
        bg.execute(() -> {
            try { core.tcpListen(port); call.resolve(); } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        });
    }

    @PluginMethod
    public void tcpConnect(PluginCall call) {
        String host = call.getString("host", "");
        int port = call.getInt("port", 0), timeout = call.getInt("timeout", 3000);
        bg.execute(() -> {
            try {
                JSObject r = new JSObject();
                r.put("id", core.tcpConnect(host, port, timeout));
                call.resolve(r);
            } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        });
    }

    @PluginMethod
    public void tcpSend(PluginCall call) { core.tcpSend(call.getInt("id", 0), call.getString("data", "")); call.resolve(); }

    @PluginMethod
    public void tcpClose(PluginCall call) { core.tcpClose(call.getInt("id", 0)); call.resolve(); }

    @PluginMethod
    public void closeAll(PluginCall call) { core.closeAll(); releaseLock(); call.resolve(); }

    /** Sebagian HP menyaring paket siaran saat MulticastLock tidak dipegang. */
    private synchronized void acquireLock() {
        if (lock != null) return;
        WifiManager wm = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wm == null) return;
        lock = wm.createMulticastLock("elemental-clash-lan");
        lock.setReferenceCounted(false);
        lock.acquire();
    }

    private synchronized void releaseLock() {
        if (lock != null && lock.isHeld()) lock.release();
        lock = null;
    }

    private void emit(JSObject e) { notifyListeners("net", e); }

    @Override
    public void onUdp(String host, int port, String data) {
        JSObject e = new JSObject();
        e.put("t", "udp"); e.put("host", host); e.put("port", port); e.put("data", data);
        emit(e);
    }

    @Override
    public void onOpen(int id, String host) {
        JSObject e = new JSObject();
        e.put("t", "open"); e.put("id", id); e.put("host", host);
        emit(e);
    }

    @Override
    public void onData(int id, String data) {
        JSObject e = new JSObject();
        e.put("t", "data"); e.put("id", id); e.put("data", data);
        emit(e);
    }

    @Override
    public void onClose(int id) {
        JSObject e = new JSObject();
        e.put("t", "close"); e.put("id", id);
        emit(e);
    }

    @Override
    protected void handleOnDestroy() {
        core.closeAll();
        releaseLock();
    }
}
