# 💥 PanelPulse

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)
![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen.svg?style=for-the-badge)

</div>

> A high-octane, Marvel-inspired digital comic library and reader designed for unpacking CBR/CBZ archives with dynamic panel transitions and isolated user vaults.

---

## ⚡ Features

* 🎨 **Marvel Visual Aesthetics**: High-contrast dark UI featuring deep blacks, `#ED1D24` action red accents, halftone-dot background textures, action-line dividers, and impactful panel borders.
* 📦 **Automated Extraction Pipeline**: Server-side parsing and image extraction for CBR and CBZ comic book archives with error boundary fallbacks.
* 📖 **Cinematic Reader**: Supports single-page views, double-page spreads, quick-jump thumbnail grids, and page-flip animations.
* 🔒 **Per-User Isolation**: Strict data segregation ensuring cover art and page assets are accessible only via authenticated, short-lived signed URLs.
* 🚀 **Smart Memory Management**: Intelligent lazy-loading that retains only current, previous, and next pages in active client memory.
* 🔖 **Auto-Saved Progress**: Seamless state persistence that tracks current page progress per user and comic book in real time.

---

## 🛠️ Tech Stack

* [Next.js](https://nextjs.org/) – React Framework for Server-Side Rendering & API Routes
* [React](https://react.dev/) – Frontend User Interface Library
* [TypeScript](https://www.typescriptlang.org/) – Type-Safe Codebase
* [Tailwind CSS](https://tailwindcss.com/) – Utility-First Responsive Styling
* [Prisma](https://www.prisma.io/) – ORM for Database Management
* [PostgreSQL](https://www.postgresql.org/) – Relational Database Engine
* [Unzipper / Unrar](https://github.com/ZJONSSON/node-unzipper) – Archive Extraction Pipeline

---

## 🚀 Quick Start & Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/panelpulse.git
   cd panelpulse
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   Copy `.env.example` to `.env` and fill in your connection strings and secret keys.

4. **Run Database Migrations**
   ```bash
   npx prisma migrate dev --name init
   ```

5. **Start the Development Server**
   ```bash
   npm run dev
   ```

---

## 🔑 Configuration & Environment Variables

Create a `.env` file in the root directory with the following keys:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/panelpulse_db?schema=public"
JWT_SECRET="super-secret-jwt-key-for-auth"
SIGNED_URL_SECRET="super-secret-key-for-short-lived-image-urls"
STORAGE_PATH="./uploads"
NEXTAUTH_URL="http://localhost:3000"
```

> ⚠️ **Security Note**: Never expose `SIGNED_URL_SECRET` or `JWT_SECRET` on the client side. Ensure user file uploads are stored in an unindexed private directory served strictly through auth-checked handler routes.

---

## 🔄 How It Works

1. **Account Registration**: Create a personal account to establish your secure, isolated comic vault.
2. **Upload Comic Archive**: Drop any `.cbz` or `.cbr` archive into the high-contrast upload interface.
3. **Extraction & Indexing**: The backend server extracts page image streams, generates thumbnail covers, and commits metadata to PostgreSQL via Prisma.
4. **Launch Reader**: Open your library and select a title to enter the dark-mode reader with comic panel frames and page flip animations.
5. **Seamless Tracking**: Reading progress updates automatically as you flip through pages, allowing you to resume exactly where you left off from any device.

---

## 📦 Building for Production

To create an optimized production build:

```bash
npm run build
```

To preview the production build locally:

```bash
npm run start
```

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Created By Mert Batu BULBUL And Chris Guerrero Martinez**
* 🎓 AI Engineering & Full Stack Developer * 💻 React *

**Don't forget to star ⭐ this repo if you found it useful!**

</div>

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](../../issues) if you want to contribute.
