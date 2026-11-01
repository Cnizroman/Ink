# Nobody came — подключение рецензий к Supabase

## 1. Создать таблицы

Открой Supabase → **SQL Editor** → создай новый запрос → вставь весь файл `supabase-schema.sql` → **Run**.

## 2. Создать администратора

В Supabase открой **Authentication → Users** и создай пользователя с email + password.

Затем в SQL Editor выполни:

```sql
insert into public.review_admins(email)
values ('ТВОЙ_EMAIL_АДМИНИСТРАТОРА')
on conflict (email) do nothing;
```

Email должен совпадать с email, который используется для входа в `reviews-admin.html`.

## 3. Загрузить файлы

После этого залей содержимое ZIP на GitHub Pages.

Публичная часть сайта сможет:
- отправлять новые отзывы как `PENDING`;
- читать только `PUBLISHED` отзывы;
- считать среднюю оценку отдельно для каждой книги.

Админка сможет:
- войти через Supabase Auth;
- видеть все отзывы всех пяти произведений;
- публиковать или отклонять `PENDING`;
- удалять опубликованные/отклонённые записи.

## Безопасность

`supabase-config.js` содержит только Project URL и Publishable key. Это нормально для клиентского сайта.

**Никогда не помещай в этот файл Secret key / service_role key.**
