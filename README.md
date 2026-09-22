# T.M.D_AI_Pro — النسخة الاحترافية

واجهة محادثة احترافية بالذكاء الاصطناعي (بنمط ChatGPT) تعمل على:

- **Vercel**
- **Groq API**
- **Vercel Blob**
- JavaScript / HTML / CSS فقط في الواجهة

## المظهر

- تصميم "Pro" داكن احترافي مع خيار المظهر الفاتح.
- شعار متحرك **بانيميشن الطوافان**: حلقتان تدوران باتجاهين متعاكسين مع قمرين متوهجين حول الشعار.
- واجهة متجاوبة بالكامل (سطح المكتب + الجوال).

## المتطلبات

أضف في Vercel Environment Variables:

1. `GROQ_API_KEY`
2. `GROQ_MODEL` (اختياري)
3. `GROQ_VISION_MODEL` (اختياري)
4. `OWNER_SECRET`
5. `BLOB_READ_WRITE_TOKEN` (اختياري — لوحة المالك والصور)

القيم المقترحة:

```text
GROQ_MODEL=openai/gpt-oss-120b
GROQ_VISION_MODEL=qwen/qwen3.8-27b
```

> ⚠️ **مهم:** لا تستخدم `llama-3.3-70b-versatile` — أصبح متاحًا لخطة Enterprise فقط على Groq، ولا تستخدم `qwen/qwen3.6-27b` — تم إيقافه من Groq.

## حل مشكلة 403 (تم رفض الوصول)

إذا ظهر لك خطأ `403` عند إرسال رسالة:

1. **مفتاح Groq:** تأكد أن `GROQ_API_KEY` صالح في [console.groq.com/keys](https://console.groq.com/keys)، وحدّثه في Vercel ثم اضغط **Redeploy**.
2. **صلاحيات النماذج:** افتح [console.groq.com](https://console.groq.com) ← Settings/Permissions وتأكد أن نماذج `openai/gpt-oss-120b` و `openai/gpt-oss-20b` و `qwen/qwen3.8-27b` مسموحة لمفتاحك.
3. **السلسلة البديلة:** الخادم يجرّب تلقائيًا نماذج بديلة (`gpt-oss-120b` ثم `gpt-oss-20b`) إذا أعاد Groq خطأ 403/404 لنموذج ما، فيعمل الدردشة النصية حتى لو تعطل نموذج واحد.

## Vercel Blob

من مشروع Vercel افتح Storage ثم أنشئ Blob Store، واربطه بالمشروع حتى تتم إضافة `BLOB_READ_WRITE_TOKEN` إلى البيئة.

يستخدم المشروع Blob لحفظ:

- إعدادات الموقع
- شعار الموقع
- خلفية الموقع

## تسجيل المالك

المستخدم العادي لا يحتاج تسجيل دخول.

المالك يضغط:

`⚙️ لوحة المالك`

ثم يدخل قيمة `OWNER_SECRET`.

لا تضع `OWNER_SECRET` داخل ملفات JavaScript.

## الصور

زر `+` بجوار خانة الكتابة يتيح:

- تحليل صورة
- اقتراح تعديلات على صورة

التحليل يتم بواسطة نموذج Groq متعدد الوسائط.

هذه النسخة لا تدّعي أنها تعدّل ملف الصورة فعليًا؛ وضع "اقتراح تعديلات" يعطي تعليمات دقيقة للتعديل. تنفيذ تعديل/توليد الصورة نفسها يحتاج خدمة صور إضافية.

## ملاحظة عن المجانية

Vercel Blob له حدود استخدام في خطة Hobby، وGroq له حدود/أسعار بحسب الحساب والنموذج. لذلك لا يوجد ضمان لاستخدام غير محدود مجانًا. هذه البنية لا تحتاج OpenAI API.

## 🔍 SEO والفهرسة في Google

المشروع مجهّز بالكامل للفهرسة والظهور في محركات البحث (تم التنفيذ في 2026-09-22):

| الملف | الوظيفة |
|---|---|
| `robots.txt` | يسمح بالزحف لكل الصفحات العامة (`Allow: /`) ويمنع `/api/` فقط، ويحتوي رابط الـ Sitemap بالدومين الحقيقي. |
| `sitemap.xml` | يضم كل الصفحات العامة: الرئيسية، عن المنصة، الأسئلة الشائعة، سياسة الخصوصية. |
| `index.html` | عنوان ووصف فريدان، `meta robots` = index,follow، Canonical، Open Graph، Twitter Cards، وبيانات منظمة Schema.org (WebSite + SoftwareApplication + Person + WebPage) مع `lang="ar"` و`dir="rtl"`. |
| `about.html` | صفحة تعريفية حقيقية بمحتوى عربي منظم (H1/H2/H3) وروابط داخلية وبيانات منظمة AboutPage. |
| `faq.html` | صفحة أسئلة شائعة حقيقية مع بيانات منظمة FAQPage مطابقة للأسئلة المعروضة. |
| `privacy.html` | سياسة خصوصية واضحة مع بيانات منظمة من نوع PrivacyPolicy. |
| `404.html` | صفحة خطأ مخصصة تُرجع حالة 404 حقيقية (لمنع Soft-404) ومعها `noindex`. |
| `web.webmanifest` | ملف PWA بالعربية (rtl) مع أيقونات 32/192/512. |
| `images/` | صورة مشاركة Open Graph بحجم 1200×630 (`og-image.jpg`) وأيقونات التطبيق. |
| `vercel.json` | روابط نظيفة عبر rewrites (مثل `/about`) مع بقاء ملفات مثل ملف تحقق Google تُخدم مباشرة بحالة 200 + ترويسات: `X-Robots-Tag: noindex` على `/api/*` وكاش آمن للصور وترويسات أمان خفيفة. لا يمس API routes أو البيئة. |
| `google205aca17c5a4688e.html` | ملف تحقق ملكية الموقع في Google Search Console (يُخدم في جذر الموقع كما هو). |
| `page.css` | تنسيقات الصفحات العامة الجديدة بنفس هوية التصميم القائمة. |

### تغيير الدومين (عند ربط دومين مخصص)

الدومين الحالي المستخدم في كل الروابط هو دومين النشر الفعلي: `https://t-m-d-ai.vercel.app`.
عند ربط دومين خاص (مثلاً `https://yourdomain.com`) استبدله في الملفات التالية فقط:

```bash
grep -rl "t-m-d-ai.vercel.app" . --exclude-dir=.git
# ثم استبدله في: index.html, about.html, faq.html, privacy.html, 404.html,
# sitemap.xml, robots.txt
```

### خطوات النشر على Vercel

1. ارفع المشروع إلى GitHub (هذا المستودع) أو استخدم Vercel CLI.
2. من [vercel.com](https://vercel.com) ← **Add New… → Project** ← اختر المستودع.
3. لا يلزم أي إعداد بناء (Framework: Other/Static) — المشروع يعمل كما هو مع مجلد `api/`.
4. أضف Environment Variables من Settings → Environment Variables: `GROQ_API_KEY` وبقية المتغيرات المذكورة أعلاه.
5. اضغط **Deploy**. للنشر اليدوي عبر CLI: `npm i -g vercel && vercel --prod`.
6. لربط دومين مخصص: Settings → Domains ← أضف دومينك وحدّث الروابط كما في الفقرة السابقة.

### إضافة الموقع إلى Google Search Console

1. ادخل [search.google.com/search-console](https://search.google.com/search-console) وسجّل الدخول بحساب Google.
2. اضغط **Add property** واختر نوع **URL prefix** وأدخل `https://t-m-d-ai.vercel.app` (أو دومينك).
3. للتحقق: انسخ كود التحقق واختر طريقة **HTML tag** — أضف الـ meta في `<head>` بملف `index.html` ثم Deploy وأعد المحاولة. (يمكن أيضًا التحقق عبر DNS إذا استخدمت دومينًا مخصصًا.)
4. ملاحظة: لا يمكن إضافة الموقع تلقائيًا من داخل الكود؛ التحقق يتطلب حسابك في Google.

### إرسال الـ Sitemap

1. في Search Console افتح الخاصية ← من القائمة الجانبية **Sitemaps**.
2. اكتب `sitemap.xml` في حقل Add a new sitemap واضغط **Submit**.
3. ستظهر حالة Success وستُفهرس الصفحات خلال ساعات إلى أيام.

### فحص صفحة وطلب الفهرسة (URL Inspection)

1. في Search Console افتح **URL Inspection** من الأعلى.
2. الصق رابط الصفحة (مثلاً `https://t-m-d-ai.vercel.app/`) واضغط Enter.
3. راجع تبويبات: Coverage/Indexing وMobile Usability وRich Results (للتأكد من سلامة Schema).
4. اضغط **Request Indexing** لطلب فهرسة فورية، وكرر ذلك لكل صفحة مهمة بعد كل نشر كبير.
5. من تبويب **View tested page / Screenshot** تأكد أن Google يرى المحتوى كما تريده.
