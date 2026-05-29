# create-pull-request

Tạo Pull Request đóng góp vào branch `main` của repo chính. Skill này dành cho **contributors**.

## Quy trình

1. Kiểm tra branch hiện tại: `git branch --show-current`
2. Kiểm tra thay đổi chưa commit: `git status`
   - Nếu có thay đổi chưa commit → gọi `/create-commit` trước
3. Kiểm tra diff so với `main`: `git log main..HEAD --oneline`
4. Soạn PR title và description theo template
5. Tạo PR: `gh pr create --base main --title "<title>" --body "<body>"`
6. In ra link PR sau khi tạo xong

## PR Template

Dùng tiếng Việt hoặc tiếng Anh tuỳ vào ngữ cảnh và người sử dụng:

```markdown
## What
[Mô tả ngắn gọn thay đổi này làm gì]

## Why
[Lý do cần thay đổi / vấn đề đang giải quyết]

## Changes
- [ ] ...
- [ ] ...

## How to test
1. ...
2. ...

## Notes
*(Xoá section này nếu không có gì cần ghi chú)*
```

## Lưu ý

- Luôn target vào branch `main` (không merge vào branch khác)
- Branch name gợi ý: `feat/ten-tinh-nang`, `fix/mo-ta-bug`, `docs/ten-doc`
- Nếu chưa có branch: `git checkout -b feat/ten-tinh-nang` trước khi tạo PR
- Kiểm tra xem đã `git push origin <branch>` chưa trước khi chạy `gh pr create`
