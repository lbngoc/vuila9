# create-commit

Phân loại các thay đổi hiện tại và tạo commit message theo **Conventional Commits**.

## Format

```
<type>(<scope>): <subject>
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `chore`, `config`, `ci`, `test`

## Quy trình

1. Chạy `git status` và `git diff` (hoặc `git diff --staged` nếu đã stage)
2. Đọc và hiểu từng thay đổi
3. Nhóm các thay đổi liên quan theo type/scope
4. Với mỗi nhóm, đề xuất commit message ngắn gọn, rõ ràng bằng tiếng Anh
5. Hỏi user confirm trước khi `git add <files>` + `git commit -m "..."`
6. Nếu có nhiều nhóm thay đổi **độc lập** → tạo nhiều commit riêng biệt

## Ví dụ commit messages

- `config(site): update project name to vuila9`
- `feat(leaderboard): add sorting by total points`
- `fix(auth): handle expired session gracefully`
- `docs(readme): add demo badge and live URL`
- `docs(contributing): add contributor guidelines`
- `chore(deps): update eleventy to v3.2`
- `ci(sync): add daily data sync workflow`
- `refactor(scripts): extract normalize logic to utils`

## Lưu ý

- Subject ngắn gọn, không quá 72 ký tự, không kết thúc bằng dấu chấm
- Dùng imperative mood: "add" không phải "added" / "adds"
- Scope là phần của codebase bị ảnh hưởng (site, auth, ui, data, scripts, ci, ...)
