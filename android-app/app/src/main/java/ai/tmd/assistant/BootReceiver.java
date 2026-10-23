package ai.tmd.assistant;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.provider.Settings;

/**
 * يعيد إظهار الفقاعة العائمة تلقائياً بعد إعادة تشغيل الهاتف أو تحديث التطبيق
 * ما دام المستخدم قد فعّل الفقاعة ولم يوقفها يدوياً.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            return;
        }
        if (!OverlayService.isBubbleEnabledPref(context)) return;
        if (Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(context)) return;

        try {
            Intent service = new Intent(context, OverlayService.class)
                    .setAction(OverlayService.ACTION_SHOW);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(service);
            } else {
                context.startService(service);
            }
        } catch (Exception ignored) {
            // بعض واجهات الشركات تقيّد بدء الخدمات الخلفية عند الإقلاع؛ يفتحها المستخدم بلمسة واحدة.
        }
    }
}
