package com.jlinfralab.mrbridge;

import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // The WebView writes cookies to disk on its own schedule, and Capacitor only flushes when its
    // CapacitorCookies API is used, which the live site doesn't. A process killed before that
    // write (a low-memory kill, a crash, `am force-stop`) lost the Supabase session and reopened
    // on /login. Flush whenever the app leaves the foreground, the last moment Android guarantees.
    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }
}
