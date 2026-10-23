package ai.tmd.assistant;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.SweepGradient;
import android.view.View;
import android.view.animation.LinearInterpolator;

/**
 * طبقة إضاءة محيطة بحدود شاشة الهاتف بالكامل (Screen-Edge Colorful Aura).
 * تعمل بنافذة مستقلة تحمل FLAG_NOT_TOUCHABLE وFLAG_NOT_FOCUSABLE حتى تمرر كل
 * اللمسات إلى تطبيقات الهاتف تحتها من دون أي حجب، مع طيف ألوان متدفق.
 */
public class AmbientEdgeGlowView extends View {
    private static final int[] SPECTRUM_IDLE = new int[]{
            0xFF00F2FE, 0xFF4F7BFF, 0xFFA855F7, 0xFFFF4FD8,
            0xFFFF7A59, 0xFFFBBF24, 0xFF10B981, 0xFF00F2FE
    };
    private static final int[] SPECTRUM_LIVE = new int[]{
            0xFF00F2FE, 0xFF10B981, 0xFF4F7BFF, 0xFFA855F7,
            0xFFFF3B7F, 0xFF00F2FE
    };

    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Matrix gradientMatrix = new Matrix();
    private final RectF strokeRect = new RectF();

    private SweepGradient idleGradient;
    private SweepGradient liveGradient;
    private ValueAnimator spinAnimator;
    private ValueAnimator alphaAnimator;

    private float angle = 0f;
    private float masterAlpha = 0f;
    private float pulsePhase = 0f;
    private String mode = "hidden";

    public AmbientEdgeGlowView(Context context) {
        super(context);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeJoin(Paint.Join.ROUND);
        paint.setStrokeCap(Paint.Cap.ROUND);
        setWillNotDraw(false);
        setVisibility(GONE);
    }

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        if (w > 0 && h > 0) {
            float cx = w * 0.5f;
            float cy = h * 0.5f;
            idleGradient = new SweepGradient(cx, cy, SPECTRUM_IDLE, null);
            liveGradient = new SweepGradient(cx, cy, SPECTRUM_LIVE, null);
        }
    }

    public void setAuraState(String nextMode) {
        String normalized = nextMode == null ? "hidden" : nextMode.trim().toLowerCase();
        if (normalized.equals(this.mode) && ("hidden".equals(normalized) || getVisibility() == VISIBLE)) {
            return;
        }
        this.mode = normalized;

        if ("hidden".equals(normalized)) {
            animateMasterAlpha(0f, 260, true);
            return;
        }

        if (getVisibility() != VISIBLE) {
            setVisibility(VISIBLE);
        }
        ensureSpinning();
        updateSpinDuration(normalized);
        float targetAlpha = "burst".equals(normalized) ? 1.0f
                : ("thinking".equals(normalized) || "listening".equals(normalized) ? 0.94f : 0.84f);
        animateMasterAlpha(targetAlpha, "burst".equals(normalized) ? 160 : 280, false);
    }

    private void ensureSpinning() {
        if (spinAnimator != null && spinAnimator.isRunning()) return;
        if (spinAnimator == null) {
            spinAnimator = ValueAnimator.ofFloat(0f, 360f);
            spinAnimator.setRepeatCount(ValueAnimator.INFINITE);
            spinAnimator.setInterpolator(new LinearInterpolator());
            spinAnimator.addUpdateListener(anim -> {
                angle = (float) anim.getAnimatedValue();
                pulsePhase += 0.09f;
                invalidate();
            });
        }
        updateSpinDuration(mode);
        spinAnimator.start();
    }

    private void updateSpinDuration(String current) {
        if (spinAnimator == null) return;
        long duration = 4800L;
        if ("thinking".equals(current) || "burst".equals(current)) {
            duration = 1750L;
        } else if ("listening".equals(current)) {
            duration = 2300L;
        } else if ("live".equals(current)) {
            duration = 3200L;
        }
        if (spinAnimator.getDuration() != duration) {
            spinAnimator.setDuration(duration);
        }
    }

    private void animateMasterAlpha(float target, long durationMs, boolean hideAtEnd) {
        if (alphaAnimator != null) {
            alphaAnimator.cancel();
        }
        alphaAnimator = ValueAnimator.ofFloat(masterAlpha, target);
        alphaAnimator.setDuration(durationMs);
        alphaAnimator.addUpdateListener(anim -> {
            masterAlpha = (float) anim.getAnimatedValue();
            invalidate();
        });
        alphaAnimator.start();

        if (hideAtEnd) {
            postDelayed(() -> {
                if ("hidden".equals(mode) && masterAlpha <= 0.02f) {
                    if (spinAnimator != null) spinAnimator.cancel();
                    setVisibility(GONE);
                }
            }, durationMs + 30);
        }
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (masterAlpha <= 0.01f) return;
        int w = getWidth();
        int h = getHeight();
        if (w <= 0 || h <= 0) return;

        SweepGradient activeShader = "live".equals(mode) ? liveGradient : idleGradient;
        if (activeShader == null) return;

        gradientMatrix.setRotate(angle, w * 0.5f, h * 0.5f);
        activeShader.setLocalMatrix(gradientMatrix);
        paint.setShader(activeShader);

        float density = getResources().getDisplayMetrics().density;
        float cornerRadius = 30f * density;
        float breathe = 1f;
        if ("listening".equals(mode) || "thinking".equals(mode)) {
            breathe = 0.86f + 0.14f * (float) Math.sin(pulsePhase);
        } else if ("burst".equals(mode)) {
            breathe = 1.12f;
        }
        float intensity = Math.min(1f, masterAlpha * breathe);

        // 5 طبقات متدرجة من الحافة الخارجية إلى الداخل لتوهج ناعم وسريع بـ 60 إطار/ثانية
        float[] widthsDp = new float[]{3.6f, 9f, 18f, 30f, 46f};
        int[] baseAlphas = new int[]{245, 128, 68, 34, 16};

        for (int i = widthsDp.length - 1; i >= 0; i--) {
            float strokePx = widthsDp[i] * density;
            float half = strokePx * 0.5f;
            strokeRect.set(half, half, w - half, h - half);
            paint.setStrokeWidth(strokePx);
            int alpha = Math.max(0, Math.min(255, Math.round(baseAlphas[i] * intensity)));
            paint.setAlpha(alpha);
            canvas.drawRoundRect(strokeRect, cornerRadius, cornerRadius, paint);
        }
    }

    @Override
    protected void onDetachedFromWindow() {
        if (spinAnimator != null) spinAnimator.cancel();
        if (alphaAnimator != null) alphaAnimator.cancel();
        super.onDetachedFromWindow();
    }
}
