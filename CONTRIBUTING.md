# Đóng góp cho Vui Là Chính (vuila9)

Cảm ơn bạn đã muốn đóng góp! Mọi PR, bug report, và feature request đều được chào đón.

## Quy trình

### 1. Fork & Clone

```bash
gh repo fork lbngoc/vuila9 --clone
cd vuila9
```

### 2. Tạo branch

```bash
git checkout -b feat/ten-tinh-nang
# hoặc: fix/mo-ta-bug, docs/ten-doc
```

### 3. Setup local

```bash
npm install
cp .env.example .env.local   # điền thông tin của bạn (hoặc dùng sample data)
npm run calculate             # dùng data/sample/ sẵn có
npm run dev                   # http://localhost:8080
```

Xem hướng dẫn đầy đủ: [`SETUP.md`](SETUP.md)

### 4. Tạo commit

Dùng [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>
```

Nếu dùng Claude Code, gõ `/create-commit` để tự động phân loại và tạo commit message.

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `chore`, `config`, `ci`, `test`

**Ví dụ:**
```
feat(leaderboard): add sorting by win rate
fix(auth): handle expired session gracefully
docs(setup): add Netlify CLI instructions
```

### 5. Tạo Pull Request

```bash
git push origin feat/ten-tinh-nang
```

Sau đó tạo PR vào branch `main`. Nếu dùng Claude Code, gõ `/create-pull-request`.

Template PR sẽ tự điền — hãy điền đầy đủ các mục **What**, **Why**, **Changes**, và **How to test**.

---

## Cấu trúc dự án

Xem [`CLAUDE.md`](CLAUDE.md) để hiểu kiến trúc và các quy tắc quan trọng.

## Báo lỗi / Đề xuất tính năng

Dùng GitHub Issues với template có sẵn:
- **Bug report** — mô tả lỗi, bước tái hiện, expected/actual behavior
- **Feature request** — vấn đề bạn đang gặp, giải pháp đề xuất

## Câu hỏi?

Mở [Discussion](../../discussions) trên GitHub — tôi sẽ trả lời sớm nhất có thể.
