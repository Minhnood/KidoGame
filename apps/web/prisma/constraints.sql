-- Ràng buộc Prisma schema không diễn đạt được.
--
-- Chạy sau mỗi lần `prisma db push`:
--   pnpm db:constraints
--
-- Viết idempotent (DROP IF EXISTS trước khi ADD) để chạy lại bao nhiêu lần cũng được.

-- Một phiên phải thuộc về ĐÚNG MỘT chủ thể: phụ huynh hoặc trẻ, không cả hai,
-- không cái nào cũng không. Không có ràng buộc này thì một bug ở tầng ứng dụng
-- có thể tạo ra phiên "mồ côi" hoặc phiên mang cả hai danh tính.
ALTER TABLE "Session" DROP CONSTRAINT IF EXISTS session_exactly_one_owner;
ALTER TABLE "Session"
  ADD CONSTRAINT session_exactly_one_owner
  CHECK (("parentId" IS NOT NULL) <> ("childId" IS NOT NULL));

-- Username của trẻ dùng để đăng nhập nên phải là chữ thường, không dấu cách.
-- Chặn ở tầng DB để không bao giờ có hai tài khoản "BeMinh" và "beminh".
ALTER TABLE "Child" DROP CONSTRAINT IF EXISTS child_username_lowercase;
ALTER TABLE "Child"
  ADD CONSTRAINT child_username_lowercase
  CHECK ("username" = lower("username") AND "username" !~ '\s');

-- Email phụ huynh cũng vậy.
ALTER TABLE "Parent" DROP CONSTRAINT IF EXISTS parent_email_lowercase;
ALTER TABLE "Parent"
  ADD CONSTRAINT parent_email_lowercase
  CHECK ("email" = lower("email"));

-- Lượt chơi và lượt report không bao giờ âm.
ALTER TABLE "Game" DROP CONSTRAINT IF EXISTS game_counts_non_negative;
ALTER TABLE "Game"
  ADD CONSTRAINT game_counts_non_negative
  CHECK ("playCount" >= 0 AND "reportCount" >= 0);
