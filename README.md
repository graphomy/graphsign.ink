# graphsign.ink

Open-source, globally compliant document generation, agreement workflow, and electronic signature platform.

---

## 🌟 Quick Links

- 📖 **[Wiki — Home](wiki/Home.md)**: Product vision, architecture, compliance, and V1 scope.
- 🚀 **[Wiki — Getting Started](wiki/Getting-Started.md)**: Step-by-step instructions to setup and run graphsign.ink locally.

---

## 🚀 Running Locally

```bash
# 1. Install dependencies
pnpm install

# 2. Setup database schema & client
pnpm --filter @graphsign/db exec prisma generate
pnpm --filter @graphsign/db exec prisma db push

# 3. Start development servers
pnpm dev
```

- Web App: [http://localhost:3000](http://localhost:3000)
- API Worker: [http://localhost:8787](http://localhost:8787)

---

## 🧪 Testing

```bash
pnpm test
```

---

## 📜 License

[AGPL-3.0](LICENSE) — Open Source Software
