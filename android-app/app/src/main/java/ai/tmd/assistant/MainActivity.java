package ai.tmd.assistant;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.ArrayList;

/**
 * نقطة تشغيل شفافة تمامًا (100% Transparent Activity).
 * - إذا كانت صلاحية الظهور فوق النظام مفعّلة عند فتح الأيقونة: تُطلق الفقاعة فورًا
 *   فوق النظام دون إظهار شاشة سوداء معتمة.
 * - عند أول تثبيت (لطلب الإذن) أو عند فتح لوحة الإدارة من الإشعار: تعرض بطاقة
 *   زجاجية شفافة طافية أسفل الشاشة مع بقاء خلفية الهاتف مرئية بالكامل.
 */
public class MainActivity extends Activity {
    public static final String ACTION_SHARE = "ai.tmd.assistant.SHARE_SCREEN";
    public static final String ACTION_PICK_IMAGE = "ai.tmd.assistant.PICK_IMAGE";
    public static final String ACTION_VOICE = "ai.tmd.assistant.VOICE_INPUT";
    public static final String ACTION_MANAGE = "ai.tmd.assistant.MANAGE";

    private static final int OVERLAY_REQUEST = 100;
    private static final int CAPTURE_REQUEST = 101;
    private static final int NOTIFICATIONS_REQUEST = 102;
    private static final int IMAGE_REQUEST = 103;
    private static final int VOICE_REQUEST = 104;
    private static final int MICROPHONE_REQUEST = 105;

    private String pendingAction;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().getDecorView().setBackgroundColor(Color.TRANSPARENT);
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        pendingAction = intent == null ? null : intent.getAction();
        if (needsNotificationPermission()) {
            showGlassSheet(false);
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATIONS_REQUEST);
            return;
        }
        continuePendingAction();
    }

    private void continuePendingAction() {
        String action = pendingAction;
        if (ACTION_SHARE.equals(action)) {
            requestCapture();
        } else if (ACTION_PICK_IMAGE.equals(action)) {
            requestImage();
        } else if (ACTION_VOICE.equals(action)) {
            requestVoice();
        } else if (ACTION_MANAGE.equals(action)) {
            showGlassSheet(true);
        } else {
            // التشغيل الفوري: إن كانت الصلاحية ممنوحة تنزل الفقاعة مباشرة فوق النظام بلا نافذة معتمة
            if (hasOverlayPermission()) {
                startAssistantService(OverlayService.ACTION_SHOW, RESULT_CANCELED, null);
                dismissSilently();
            } else {
                showGlassSheet(false);
            }
        }
    }

    @SuppressWarnings("deprecation")
    private void dismissSilently() {
        finish();
        overridePendingTransition(0, 0);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == NOTIFICATIONS_REQUEST) {
            continuePendingAction();
        } else if (requestCode == MICROPHONE_REQUEST) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
                launchVoiceRecognizer();
            } else {
                OverlayService.notifyVoiceError("تم رفض إذن الميكروفون. فعّله لاستخدام التحدث الصوتي.");
                dismissSilently();
            }
        }
    }

    private boolean needsNotificationPermission() {
        return Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED;
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private void showGlassSheet(boolean manageMode) {
        FrameLayout backdrop = new FrameLayout(this);
        backdrop.setBackgroundColor(Color.TRANSPARENT);
        backdrop.setOnClickListener(v -> {
            if (hasOverlayPermission() && OverlayService.isRunning()) {
                dismissSilently();
            }
        });

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_HORIZONTAL);
        card.setClickable(true);
        card.setPadding(dp(22), dp(22), dp(22), dp(20));

        GradientDrawable glassBg = new GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                new int[]{0xD80D142B, 0xE2080B1A});
        glassBg.setCornerRadius(dp(28));
        glassBg.setStroke(dp(1), 0x6600F2FE);
        card.setBackground(glassBg);

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.ic_app_logo);
        LinearLayout.LayoutParams logoParams = new LinearLayout.LayoutParams(dp(64), dp(64));
        logoParams.bottomMargin = dp(10);
        card.addView(logo, logoParams);

        TextView title = new TextView(this);
        title.setText("فقاعة AURA الذكية");
        title.setTextSize(21);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(Color.WHITE);
        title.setGravity(Gravity.CENTER);
        card.addView(title);

        TextView credit = new TextView(this);
        credit.setText("من معتصم عمرو الى M");
        credit.setTextSize(13f);
        credit.setTypeface(Typeface.DEFAULT_BOLD);
        credit.setTextColor(0xFF7EF9FF);
        credit.setGravity(Gravity.CENTER);
        credit.setPadding(dp(8), dp(4), dp(8), dp(2));
        card.addView(credit);

        TextView subtitle = new TextView(this);
        subtitle.setText(manageMode
                ? "فقاعة عائمة بشفافية كاملة على وجه النظام، مع إضاءة ملونة لحدود الشاشة وبث مباشر للشاشة."
                : "امنح إذن «الظهور فوق التطبيقات» مرة واحدة فقط لتستقر الفقاعة الذكية على شاشة هاتفك فوراً.");
        subtitle.setTextSize(13.5f);
        subtitle.setTextColor(0xFFD2E0FF);
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setPadding(dp(6), dp(8), dp(6), dp(16));
        card.addView(subtitle);

        Button primaryBtn = styledButton(
                hasOverlayPermission() ? "فتح شريط الشات والإضاءة الآن" : "تفعيل الفقاعة فوق النظام",
                new int[]{0xFF00D2FF, 0xFF6366F1, 0xFFEC4899},
                Color.WHITE);
        primaryBtn.setOnClickListener(v -> {
            if (!hasOverlayPermission()) {
                openOverlayPermissionScreen();
            } else {
                startAssistantService(OverlayService.ACTION_OPEN_DOCK, RESULT_CANCELED, null);
                dismissSilently();
            }
        });
        card.addView(primaryBtn, buttonLayout());

        Button liveBtn = styledButton(
                "بدء بث مباشر للشاشة مع الذكاء الاصطناعي",
                new int[]{0x4400F2FE, 0x44A855F7},
                0xFFEAF6FF);
        liveBtn.setOnClickListener(v -> {
            pendingAction = ACTION_SHARE;
            requestCapture();
        });
        card.addView(liveBtn, buttonLayout());

        if (manageMode || OverlayService.isRunning()) {
            Button stopBtn = styledButton(
                    "إيقاف الفقاعة العائمة",
                    new int[]{0x33FF3B7F, 0x33FF6B4A},
                    0xFFFFC8D8);
            stopBtn.setOnClickListener(v -> {
                OverlayService.setBubbleEnabledPref(this, false);
                stopService(new Intent(this, OverlayService.class));
                dismissSilently();
            });
            card.addView(stopBtn, buttonLayout());
        }

        FrameLayout.LayoutParams cardParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        cardParams.setMargins(dp(14), dp(14), dp(14), dp(22));
        backdrop.addView(card, cardParams);
        setContentView(backdrop);
    }

    private Button styledButton(String label, int[] colors, int textColor) {
        Button btn = new Button(this);
        btn.setText(label);
        btn.setAllCaps(false);
        btn.setTextSize(14);
        btn.setTypeface(Typeface.DEFAULT_BOLD);
        btn.setTextColor(textColor);
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, colors);
        bg.setCornerRadius(dp(999));
        bg.setStroke(dp(1), 0x44FFFFFF);
        btn.setBackground(bg);
        btn.setPadding(dp(16), dp(12), dp(16), dp(12));
        return btn;
    }

    private LinearLayout.LayoutParams buttonLayout() {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        p.setMargins(0, dp(5), 0, dp(5));
        return p;
    }

    private boolean hasOverlayPermission() {
        return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(this);
    }

    private void openOverlayPermissionScreen() {
        startActivityForResult(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getPackageName())), OVERLAY_REQUEST);
    }

    private boolean ensureOverlayPermission() {
        if (hasOverlayPermission()) return true;
        showGlassSheet(false);
        openOverlayPermissionScreen();
        return false;
    }

    private void requestCapture() {
        if (!ensureOverlayPermission()) return;
        startAssistantService(OverlayService.ACTION_SHOW, RESULT_CANCELED, null);
        MediaProjectionManager manager = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        startActivityForResult(manager.createScreenCaptureIntent(), CAPTURE_REQUEST);
    }

    private void requestImage() {
        if (!ensureOverlayPermission()) return;
        Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType("image/*");
        startActivityForResult(picker, IMAGE_REQUEST);
    }

    private void requestVoice() {
        if (!ensureOverlayPermission()) return;
        if (Build.VERSION.SDK_INT >= 23
                && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MICROPHONE_REQUEST);
            return;
        }
        launchVoiceRecognizer();
    }

    private void launchVoiceRecognizer() {
        Intent voice = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ar-SA")
                .putExtra(RecognizerIntent.EXTRA_PROMPT, "تحدّث إلى فقاعة AURA الذكية");
        try {
            startActivityForResult(voice, VOICE_REQUEST);
        } catch (Exception error) {
            OverlayService.notifyVoiceError("لا توجد خدمة تعرّف صوتي متاحة على هذا الهاتف.");
            dismissSilently();
        }
    }

    private void startAssistantService(String action, int resultCode, Intent source) {
        OverlayService.setBubbleEnabledPref(this, true);
        Intent service = new Intent(this, OverlayService.class).setAction(action);
        if (source != null) {
            service.putExtra(OverlayService.EXTRA_RESULT_CODE, resultCode);
            service.putExtra(OverlayService.EXTRA_RESULT_DATA, source);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(service);
        else startService(service);
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == OVERLAY_REQUEST) {
            if (hasOverlayPermission()) {
                if (ACTION_SHARE.equals(pendingAction)) {
                    requestCapture();
                } else {
                    startAssistantService(OverlayService.ACTION_OPEN_DOCK, RESULT_CANCELED, null);
                    dismissSilently();
                }
            } else {
                OverlayService.notifyPermissionError("يلزم السماح بالظهور فوق التطبيقات لتشغيل الفقاعة.");
            }
            return;
        }
        if (request == CAPTURE_REQUEST) {
            if (result == RESULT_OK && data != null) {
                startAssistantService(OverlayService.ACTION_CAPTURE, result, data);
            } else {
                OverlayService.notifyShareDenied();
            }
            dismissSilently();
            return;
        }
        if (request == IMAGE_REQUEST) {
            if (result == RESULT_OK && data != null && data.getData() != null) {
                OverlayService.deliverPickedImage(data.getData());
            } else {
                OverlayService.notifyImageError("لم يتم اختيار صورة.");
            }
            dismissSilently();
            return;
        }
        if (request == VOICE_REQUEST) {
            if (result == RESULT_OK && data != null) {
                ArrayList<String> matches = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                if (matches != null && !matches.isEmpty()) OverlayService.deliverVoiceText(matches.get(0));
                else OverlayService.notifyVoiceError("لم أتمكن من سماع كلام واضح.");
            } else {
                OverlayService.notifyVoiceError("أُلغي الإدخال الصوتي.");
            }
            dismissSilently();
        }
    }
}
