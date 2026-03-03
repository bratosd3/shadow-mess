# Shadow Mess v2.0

Полнофункциональный мессенджер с реальным временем, звонками и загрузкой файлов.

## Технологии

- **Backend**: Node.js, Express, Socket.io, Mongoose
- **Database**: MongoDB Atlas
- **Auth**: JWT + bcrypt
- **Frontend**: Vanilla JS SPA
- **Files**: Multer

## Быстрый старт (локально)

```bash
npm install
MONGODB_URI="mongodb+srv://..." node server.js
```

## Развёртывание на Render

1. Запуши код на GitHub
2. На [render.com](https://render.com) → New → Web Service
3. Подключи репозиторий
4. Настройки:
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
5. В Environment → добавь переменную `MONGODB_URI` со строкой подключения MongoDB Atlas
6. Deploy

## Переменные окружения

| Переменная | Описание |
|------------|----------|
| `MONGODB_URI` | Строка подключения MongoDB Atlas |
| `JWT_SECRET` | Секрет JWT (опционально) |
| `PORT` | Порт сервера (Render задаёт автоматически) |
