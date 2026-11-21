# Пошаговое развёртывание StandEL Time v0.7

## 0. Что нужно зарегистрировать
Аккаунты **StandEL AB** в Supabase, Vercel, Resend и Twilio; домен `standeltime.se` у регистратора (сначала проверить доступность). Храните ключи только в панели поставщиков и `.env.local`, никогда не пересылайте их в чат.

## 1. Supabase
1. Создать новый проект, выбрать **North EU (Stockholm) eu-north-1**, задать надёжный пароль БД.
2. В SQL Editor запустить `sql/001_schema.sql`.
3. Authentication → Sign In/Providers: email ON, phone ON; подключить SMS-провайдера (Twilio / Verify). **Allow new users to sign up: OFF**. Anonymous sign-ins OFF.
4. Добавить собственный SMTP для писем с кодами; изменить шаблон email OTP, чтобы выводился `{{ .Token }}`.
5. Authentication → URL Configuration: `Site URL=https://standeltime.se`, allow `https://standeltime.se/auth/callback` и необходимые localhost URL только для девелопмента.
6. Создать в Auth → Users **только первого администратора** вручную, подтвердить его email.
7. В SQL Editor выполнить пример с настоящим UUID из Auth Users:

```sql
insert into public.organizations(name,registration_no)
values('StandEL AB','559438-2821') returning id;
-- подставить скопированный organization UUID и user UUID администратора:
insert into public.org_members(org_id,user_id,role,display_name)
values('ORG_UUID','AUTH_USER_UUID','admin','StandEL Admin');
```

8. В Project Settings → API / Connect взять URL, publishable key и **secret key**. Secret key только на сервере.
9. В Settings → Backups включить и проверить соответствующий план. Настроить отдельно архивный off-site backup и тест восстановления.

## 2. Resend и Twilio
- Resend: проверить домен отправителя (SPF/DKIM), создать серверный API key. Заполнить `RESEND_API_KEY` и `INVITE_FROM_EMAIL`.
- Twilio: приобрести или настроить отправителя и права отправлять SMS на +46 и другие нужные страны. Создать `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`. Настроить Twilio (или совместимый провайдер) отдельно в Supabase Auth для **OTP-кодов**.
- Учитывать стоимость отправки каждой SMS, лимиты, защиту от автоматизированных повторных запросов, rate limits/CAPTCHA. OTP не должен создавать аккаунты без приглашения.

## 3. Локально
```bash
npm install
cp .env.example .env.local
# заполнить .env.local самостоятельно
npm run dev
```
Открыть `http://localhost:3000`. Первого администратора создавать через Supabase Dashboard и SQL, **не через открытую форму регистрации**.

## 4. Vercel
1. Создать Git-репозиторий; до push убедиться, что `.env.local` не попадёт в git.
2. Import Project в Vercel, framework Next.js, Root Directory = корень `StandEL_Time_v07`.
3. Environment Variables: все переменные `.env.example` (без префикса `NEXT_PUBLIC_` для секретов); для production `APP_URL=https://standeltime.se`.
4. Build / Deploy, проверить страницу входа, callback и server functions.
5. В Vercel → Settings → Domains добавить `standeltime.se`; настроить рекомендованные Vercel DNS записи у регистратора, дождаться HTTPS.
6. Обновить Supabase Site URL и Redirect URLs, повторить сценарии OTP, приглашения и доступа. При смене домена выполнить новый деплой.

## 5. Предпусковая проверка
- Проверить регистрацию по email и SMS на **разных реальных телефонах**, одноразовость и срок приглашений.
- Проверить изменение часов с аудитом, разграничение доступа, восстановление из резервной копии.
- Провести проверку защиты персональных данных, политику хранения, сроки удаления, DPA с поставщиками; персонал должен быть информирован о работодателе и обработке данных.
- До выполнения проверки безопаснее использовать только тестовые имена и часы.

## 6. После запуска
Ежедневные резервные копии, мониторинг ошибок и расходов, лимиты SMS, проверка сроков ID06, закрытие платёжных периодов, обучение администраторов, проверка восстановления минимум раз в квартал.

### Официальные справки
- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://supabase.com/docs/guides/auth/general-configuration
- https://supabase.com/docs/guides/auth/phone-login
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/platform/backups
- https://vercel.com/docs/domains/set-up-custom-domain
