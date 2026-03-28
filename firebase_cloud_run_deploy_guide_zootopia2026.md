# دليل نشر منصة Zootopia Club على Firebase + Cloud Run
## المشروع: `zootopia2026`
## الدومين: `zootopiaclub.studio`

> هذا الدليل مخصص لمسار النشر العملي التالي:
>
> - **Frontend** على **Firebase Hosting**
> - **Backend / API** على **Cloud Run**
> - **Firebase Hosting Rewrites** لتوجيه `/api/**` إلى Cloud Run
> - **Custom Domain** من **Name.com** إلى Firebase Hosting

---

# 1) لماذا هذا هو المسار الأفضل؟

لأن **Firebase Hosting** ممتاز للواجهة الأمامية والملفات الثابتة، بينما **Cloud Run** هو الخيار الأنسب لتشغيل باك إند Node/Express أو خدمات ديناميكية. Firebase Hosting يدعم رسميًا التوجيه إلى Cloud Run عبر rewrites، لذلك يظهر المشروع للمستخدم وكأنه منصة واحدة متكاملة.

هذا المسار مناسب جدًا لـ Zootopia Club لأنك تريد:

- واجهة React/Vite سريعة ومستقرة
- API و backend منفصل ومنظم
- ربط سهل مع Firebase Auth / Firestore / Storage
- ربط دومين احترافي
- مرونة مستقبلية في التوسعة

---

# 2) البنية النهائية المقترحة

```text
User Browser
   |
   v
zootopiaclub.studio  --> Firebase Hosting (Frontend)
   |
   +--> /api/** --> Cloud Run service: zootopia-api
```

---

# 3) المتطلبات قبل البدء

تأكد من وجود الآتي:

- مشروع Firebase / Google Cloud باسم: `zootopia2026`
- الخطة: **Blaze**
- حساب Google عليه صلاحية Owner أو Editor أو Firebase Admin
- الدومين `zootopiaclub.studio` موجود على Name.com
- Node.js مثبت
- npm مثبت
- Git اختياري لكن مفيد
- VS Code مثبت

---

# 4) تثبيت الأدوات المطلوبة

## 4.1 تثبيت Firebase CLI

افتح Terminal واكتب:

```bash
npm install -g firebase-tools
```

اختبار التثبيت:

```bash
firebase --version
```

## 4.2 تثبيت Google Cloud CLI على ويندوز

### الطريقة الرسمية
1. ادخل موقع Google Cloud CLI الرسمي.
2. نزّل Windows Installer.
3. شغّل ملف التثبيت.
4. أكمل خطوات التثبيت الافتراضية.
5. افتح Terminal جديد.

اختبار التثبيت:

```bash
gcloud --version
```

> لو الأمر لا يعمل:
> - اقفل Terminal وافتحه من جديد
> - أو أعد تشغيل الجهاز
> - أو تأكد أن `gcloud` أضيف إلى PATH

---

# 5) تسجيل الدخول وربط الأدوات بالمشروع

## 5.1 تسجيل الدخول إلى Firebase

```bash
firebase login
```

## 5.2 تسجيل الدخول إلى Google Cloud

```bash
gcloud auth login
```

## 5.3 تعيين المشروع الحالي

```bash
gcloud config set project zootopia2026
```

## 5.4 التحقق من المشروع الحالي

```bash
gcloud config get-value project
```

يجب أن يرجع:

```bash
zootopia2026
```

## 5.5 إنشاء Application Default Credentials

هذه مفيدة جدًا لبعض الأدوات والمكتبات:

```bash
gcloud auth application-default login
```

---

# 6) تفعيل الخدمات المطلوبة في Google Cloud / Firebase

فعّل من Google Cloud Console أو Firebase Console الخدمات التالية:

- Firebase Hosting
- Cloud Run
- Cloud Build
- Artifact Registry
- Firestore
- Cloud Storage
- Secret Manager (مستحسن)
- Firebase Authentication (إذا كنت تستخدمه)

---

# 7) تجهيز المشروع محليًا

افتح مشروعك في VS Code من الجذر الرئيسي.

يفضل أن تكون البنية مفهومة وواضحة، مثل:

```text
project-root/
  src/
  server/
  public/
  package.json
  firebase.json
  .firebaserc
```

> لا يلزم أن تكون بهذا الشكل حرفيًا، لكن الأهم أن تعرف:
> - أين الواجهة
> - أين الباك إند
> - ما أمر التشغيل
> - ما مجلد الـ build النهائي للواجهة

---

# 8) تهيئة Firebase Hosting

من داخل جذر المشروع شغّل:

```bash
firebase init hosting
```

## عند ظهور الأسئلة:
- اختر المشروع: `zootopia2026`
- اختر مجلد الـ public root:
  - غالبًا `dist` لو المشروع Vite
- هل هو single-page app؟
  - **Yes**
- هل تريد overwrite لملفات موجودة؟
  - **No** غالبًا

---

# 9) بناء الواجهة

في مشاريع React/Vite غالبًا:

```bash
npm run build
```

بعدها تأكد أن مجلد `dist` اتولد بنجاح.

---

# 10) إعداد firebase.json

افتح `firebase.json` واجعله قريبًا من هذا الشكل:

```json
{
  "hosting": {
    "public": "dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "/api/**",
        "run": {
          "serviceId": "zootopia-api",
          "region": "us-central1"
        }
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

## شرح هذا الملف
- `public: "dist"` يعني أن Firebase سيرفع ملفات الواجهة من مجلد `dist`
- rewrite الأول:
  - أي طلب يبدأ بـ `/api/` يذهب إلى Cloud Run
- rewrite الثاني:
  - باقي الطلبات تذهب إلى `index.html` لدعم React Router / SPA

---

# 11) إعداد package.json

تأكد من وجود أوامر تشغيل واضحة.

## للواجهة
يفضل أن يكون عندك:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  }
}
```

## للباك إند
لابد أن يكون عندك أمر تشغيل واضح للخدمة.

مثال:

```json
{
  "scripts": {
    "start": "node server.js"
  }
}
```

أو حسب مشروعك:

```json
{
  "scripts": {
    "start": "tsx server.ts"
  }
}
```

> المهم: Cloud Run يحتاج خدمة قابلة للتشغيل من أمر واضح.

---

# 12) إعداد الباك إند لـ Cloud Run

## 12.1 المنفذ PORT
تأكد أن السيرفر يستمع على متغير البيئة `PORT`.

مثال Express:

```js
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server running on ${port}`);
});
```

> لا تعتمد على port ثابت فقط مثل 3000 داخل Cloud Run.

## 12.2 الصحة Health Check
يفضل وجود route بسيط:

```js
app.get('/health', (req, res) => {
  res.status(200).json({ ok: true });
});
```

---

# 13) نشر الواجهة أول مرة

```bash
firebase deploy --only hosting
```

بعدها سيظهر لك رابط مثل:
- `https://PROJECT_ID.web.app`
- أو `https://PROJECT_ID.firebaseapp.com`

اختبر الواجهة عليه أولًا.

---

# 14) نشر الباك إند إلى Cloud Run

من جذر المشروع أو مجلد الباك إند، نفذ:

```bash
gcloud run deploy zootopia-api --source . --region us-central1 --allow-unauthenticated
```

## لو احتجت تخصيصات إضافية:

```bash
gcloud run deploy zootopia-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --timeout 1800
```

## شرح أهم الخيارات
- `zootopia-api`: اسم الخدمة
- `--source .`: النشر من المجلد الحالي
- `--region us-central1`: المنطقة
- `--allow-unauthenticated`: يسمح بالوصول العام للـ API من الويب
- `--memory 2Gi`: يرفع الذاكرة
- `--timeout 1800`: يرفع timeout إلى 30 دقيقة

> ابدأ بأبسط إعداد، ثم زد الذاكرة والتخصيصات عند الحاجة.

---

# 15) اختبار Cloud Run مباشرة

بعد النشر، Google Cloud سيعطيك رابطًا مثل:

```text
https://zootopia-api-xxxxx-uc.a.run.app
```

اختبر:
- `/health`
- أي endpoint API معروف

مثال:

```bash
curl https://YOUR_RUN_URL/health
```

أو افتحه في المتصفح.

---

# 16) إعادة نشر Hosting بعد ربطه بـ Cloud Run

بعد التأكد أن اسم خدمة Cloud Run هو فعلًا `zootopia-api` وأن المنطقة مطابقة لما في `firebase.json`، أعد نشر الواجهة:

```bash
firebase deploy --only hosting
```

الآن:
- الواجهة ستعمل من Firebase Hosting
- وطلبات `/api/**` ستذهب إلى Cloud Run

---

# 17) تعديل الواجهة لتستخدم /api

بدل وضع رابط خارجي للباك إند، اجعل الواجهة تستخدم:

```ts
const API_BASE = "/api";
```

أو في `.env`:

```env
VITE_API_BASE_URL=/api
```

> هذا أفضل من استخدام `run.app` مباشرة لأنه:
> - يقلل مشاكل CORS
> - يجعل الموقع متماسكًا
> - يجعل الربط مع الدومين أبسط

---

# 18) ربط الدومين zootopiaclub.studio

## 18.1 من Firebase Console
1. افتح مشروع `zootopia2026`
2. ادخل إلى **Hosting**
3. اضغط **Add custom domain**
4. أضف:
   - `zootopiaclub.studio`
   - `www.zootopiaclub.studio`

## 18.2 من Name.com
1. سجل الدخول
2. ادخل إلى **My Domains**
3. اختر `zootopiaclub.studio`
4. افتح **Manage DNS Records**
5. أضف السجلات التي يعطيك إياها Firebase **بالضبط**

غالبًا Firebase سيطلب:
- TXT للتحقق
- A records أو CNAME
- غالبًا `www` يكون CNAME

> لا تخترع السجلات من نفسك.
> انسخها حرفيًا من Firebase.

## 18.3 انتظر التحقق
- ارجع إلى Firebase Hosting
- انتظر حتى يتحول الدومين إلى Connected / Verified
- SSL غالبًا يتفعل تلقائيًا

---

# 19) إعداد Firebase Auth بعد ربط الدومين

إذا كنت تستخدم Firebase Auth:
- افتح Firebase Console
- Authentication
- Settings
- Authorized domains

أضف:
- `zootopiaclub.studio`
- `www.zootopiaclub.studio`

> هذه خطوة مهمة جدًا حتى لا يفشل login بعد ربط الدومين.

---

# 20) التعامل مع متغيرات البيئة

## 20.1 متغيرات الواجهة
ضع في ملف `.env` للواجهة أشياء مثل:

```env
VITE_API_BASE_URL=/api
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=zootopia2026
```

## 20.2 متغيرات Cloud Run
ضع أسرارك في Cloud Run عبر Console أو CLI.

مثال إضافة متغيرات:

```bash
gcloud run services update zootopia-api \
  --region us-central1 \
  --update-env-vars NODE_ENV=production
```

> للأسرار الحساسة جدًا، استخدم Secret Manager.

---

# 21) أوامر النشر اليومية

## عند تعديل الواجهة

```bash
npm run build
firebase deploy --only hosting
```

## عند تعديل الباك إند

```bash
gcloud run deploy zootopia-api --source . --region us-central1 --allow-unauthenticated
```

## عند تعديل الاثنين
نفذ بالتسلسل:

```bash
npm run build
firebase deploy --only hosting
gcloud run deploy zootopia-api --source . --region us-central1 --allow-unauthenticated
firebase deploy --only hosting
```

---

# 22) أوامر مفيدة جدًا

## Firebase
```bash
firebase login
firebase logout
firebase use --add
firebase projects:list
firebase init hosting
firebase deploy --only hosting
firebase deploy
firebase hosting:channel:list
firebase hosting:channel:deploy preview
firebase emulators:start
firebase serve
```

## Google Cloud CLI
```bash
gcloud --version
gcloud auth login
gcloud auth list
gcloud auth application-default login
gcloud config set project zootopia2026
gcloud config get-value project
gcloud config list
gcloud projects describe zootopia2026
gcloud run deploy zootopia-api --source . --region us-central1 --allow-unauthenticated
gcloud run services list
gcloud run services describe zootopia-api --region us-central1
gcloud run services update zootopia-api --region us-central1 --memory 2Gi
gcloud run services update zootopia-api --region us-central1 --timeout 1800
gcloud logging read
```

---

# 23) أوامر استكشاف الأعطال

## عرض خدمات Cloud Run
```bash
gcloud run services list
```

## وصف الخدمة
```bash
gcloud run services describe zootopia-api --region us-central1
```

## قراءة logs
```bash
gcloud logging read "resource.type=cloud_run_revision" --limit=50
```

## اختبار محلي للواجهة
```bash
npm run dev
```

## اختبار Firebase محليًا
```bash
firebase emulators:start
```

---

# 24) أكثر المشاكل شيوعًا

## 24.1 الموقع يعمل والـ API لا يعمل
تحقق من:
- اسم خدمة Cloud Run في `firebase.json`
- region
- أن route `/api/**` مضبوط
- أن الباك إند يعمل أصلًا على Cloud Run

## 24.2 صفحة بيضاء بعد النشر
تحقق من:
- هل `npm run build` نجح؟
- هل `public` في `firebase.json` هو `dist` فعلًا؟
- هل build يخرج ملفات صحيحة؟

## 24.3 تسجيل الدخول لا يعمل بعد ربط الدومين
تحقق من:
- Firebase Auth Authorized Domains
- API base URL
- CORS
- هل ما زلت تستخدم دومين `web.app` في بعض الإعدادات؟

## 24.4 Cloud Run يفشل في التشغيل
تحقق من:
- أمر start
- `process.env.PORT`
- logs
- env vars
- dependencies
- هل المشروع يحتاج Dockerfile مخصص؟

---

# 25) توصيات مهمة لمشروع Zootopia

- اجعل `/api` هو المسار الأساسي من الواجهة
- لا تضع رابط `run.app` مباشر داخل الواجهة إلا عند الطوارئ
- حافظ على فصل frontend وbackend لكن عبر تجربة موحدة للمستخدم
- أضف endpoint `/health`
- أضف logs واضحة عند startup
- اختبر أولًا على `web.app` قبل ربط الدومين
- لا تعبث بـ DNS قبل التأكد أن النشر الأساسي شغال

---

# 26) التسلسل المثالي للتنفيذ

1. تثبيت Firebase CLI
2. تثبيت Google Cloud CLI
3. `firebase login`
4. `gcloud auth login`
5. `gcloud config set project zootopia2026`
6. تفعيل Hosting وCloud Run
7. `firebase init hosting`
8. ضبط `firebase.json`
9. `npm run build`
10. `firebase deploy --only hosting`
11. `gcloud run deploy zootopia-api --source . --region us-central1 --allow-unauthenticated`
12. اختبار `web.app`
13. Add custom domain من Firebase
14. نسخ DNS إلى Name.com
15. انتظار التفعيل
16. إضافة الدومين إلى Firebase Auth
17. اختبار الموقع النهائي

---

# 27) أوامر مختصرة نهائية

```bash
firebase login
gcloud auth login
gcloud config set project zootopia2026
firebase init hosting
npm run build
firebase deploy --only hosting
gcloud run deploy zootopia-api --source . --region us-central1 --allow-unauthenticated
firebase deploy --only hosting
```

---

# 28) ملاحظات عن الملفات الكبيرة

بما أنك قررت حاليًا أن الحد الأقصى هو **32MB**:
- ارفع الملفات عبر الواجهة كما هي
- مررها للباك إند حسب معمارية مشروعك
- لكن لاحقًا لو عدت لملفات أكبر، الأفضل الانتقال إلى:
  - Cloud Storage
  - ثم المعالجة على Cloud Run

---

# 29) مراجع رسمية موصى بها

- Firebase Hosting Quickstart
- Firebase Hosting Overview
- Firebase Hosting + Cloud Run
- Firebase Custom Domain
- Firebase CLI Reference
- Cloud Run Docs
- Google Cloud CLI Docs
- Name.com DNS Help

---

# 30) Checklist قبل أول نشر فعلي

- [ ] Firebase CLI مثبت
- [ ] Google Cloud CLI مثبت
- [ ] Logged in to Firebase
- [ ] Logged in to Google Cloud
- [ ] المشروع الصحيح: `zootopia2026`
- [ ] `firebase.json` مضبوط
- [ ] `npm run build` يعمل
- [ ] الباك إند يستخدم `PORT`
- [ ] خدمة Cloud Run منشورة
- [ ] `/api/**` مربوط بـ Cloud Run
- [ ] `web.app` يعمل
- [ ] الدومين مضاف في Firebase
- [ ] DNS مضاف في Name.com
- [ ] Authorized domains مضافة في Firebase Auth

---

إذا أردت، اجعل الخطوة التالية بعد هذا الدليل هي:
1. مراجعة `firebase.json`
2. مراجعة `package.json`
3. مراجعة ملف السيرفر
4. إعطاءك أوامر النشر النهائية المناسبة بالضبط لمشروعك الحالي
