# Image cho app Next.js (service `web` trong docker-compose.yml).
#
# MỘT STAGE, KHÔNG multi-stage. Cố ý.
#
# pnpm dựng node_modules bằng symlink trỏ vào store .pnpm. Copy node_modules từ
# stage này sang stage khác là làm đứt đám symlink đó, và biểu hiện là lỗi
# "Cannot find module" lúc chạy — nhìn không ra nguyên nhân. Đổi lại image nặng
# hơn (~1.5GB), nhưng dự án này đã chọn ít điểm vỡ hơn thay vì gọn hơn ở mọi
# quyết định deploy khác (scrypt thay argon2, cột titleSearch thay unaccent).
#
# CŨNG KHÔNG dùng `output: 'standalone'` của Next: @kidogame/sb3 và sharp nằm
# trong serverExternalPackages, tức là Node phải require được chúng từ
# node_modules thật lúc chạy. File tracing của standalone không kéo theo được
# @turbowarp/packager mà sb3 nạp động qua createRequire.
#
# VÀ KHÔNG `pnpm prune --prod`: prisma CLI và tsx đều là devDependencies, mà
# `db:push`, `db:seed`, `db:backfill-search` đều cần chúng. Cắt devDeps là cắt
# luôn khả năng migrate DB từ trong container.
FROM node:24-bookworm-slim

# openssl        — prisma query engine cần, bookworm-slim không có sẵn.
# postgresql-client — `pnpm db:push` gọi tiếp db:constraints, mà script đó chạy
#                     `psql` để áp constraints.sql. Thiếu psql là migrate chết
#                     ở bước cuối, sau khi schema đã push xong một nửa.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      openssl \
      ca-certificates \
      postgresql-client \
 && rm -rf /var/lib/apt/lists/*

# Cài pnpm bằng npm chứ không qua corepack: bớt một lớp có thể hỏng khi Node
# đổi cách đóng gói corepack. Ghim đúng phiên bản đang dùng ở máy dev.
RUN npm install -g pnpm@11.8.0

WORKDIR /app

# Copy theo hai đợt để cache layer: đổi code app (đợt 2) thì không phải cài lại
# dependency.
#
# packages/sb3 phải có CẢ SOURCE ngay đợt này, không chỉ package.json: nó có
# script `prepare` chạy tsc, mà pnpm gọi prepare của workspace package ngay
# trong lúc install. Chỉ đưa package.json vào thì install chết vì không có gì
# để biên dịch.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/sb3 ./packages/sb3
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY apps/web ./apps/web
COPY infra ./infra

# ---------------------------------------------------------------------------
# CSP của app được TÍNH LÚC BUILD, không phải lúc chạy.
#
# `headers()` trong next.config.ts được Next đánh giá trong `next build` rồi nướng
# thẳng vào .next/routes-manifest.json. Nghĩa là `frame-src` lấy giá trị PLAYER_ORIGIN
# tại thời điểm BUILD. Đặt PLAYER_ORIGIN ở compose environment là QUÁ MUỘN — nó chỉ
# sửa được URL do `objectUrl()` sinh ra (hàm đó đọc env lúc gọi), còn CSP vẫn giữ
# giá trị mặc định của dev là http://127.0.0.1:3001.
#
# Hậu quả nếu quên: iframe trỏ đúng player domain nhưng CSP chặn nó, và triệu chứng
# là "game không boot" / "stage 0x0" — nhìn y hệt lỗi đóng gói. Đã vấp thật khi
# `docker compose up` lần đầu.
#
# BUILT_PLAYER_ORIGIN được giữ lại trong image để `src/instrumentation.ts` đối chiếu
# lúc khởi động: lệch là chết ngay với thông báo rõ ràng, thay vì im lặng hỏng.
# ---------------------------------------------------------------------------
ARG PLAYER_ORIGIN=http://127.0.0.1:3001
ENV PLAYER_ORIGIN=${PLAYER_ORIGIN} \
    BUILT_PLAYER_ORIGIN=${PLAYER_ORIGIN}

# `pnpm install` ở trên đã chạy `prepare` của packages/sb3 nên dist/ thường có
# rồi; gọi build tường minh ở đây là lưới an toàn, vì dist/ KHÔNG được track
# trong git và nếu prepare bị bỏ qua thì Next sẽ không tìm thấy @kidogame/sb3
# lúc chạy (nó nằm trong serverExternalPackages, Node đọc thẳng dist/index.js).
# prisma generate không cần DB thật, chỉ cần schema.
RUN pnpm --filter @kidogame/sb3 build \
 && pnpm --filter @kidogame/web exec prisma generate \
 && pnpm --filter @kidogame/web build

# Volume storage được mount vào đây. Tạo sẵn và chown trong image: Docker copy
# quyền của thư mục trong image sang named volume mới, nên user `node` mới ghi
# được file .sb3/.html upload lên.
RUN mkdir -p /srv/storage && chown -R node:node /srv/storage \
 && chown -R node:node /app/apps/web/.next

ENV NODE_ENV=production \
    STORAGE_DIR=/srv/storage

# Không chạy bằng root: game do người lạ upload được giải nén và đóng gói bởi
# tiến trình này.
USER node

EXPOSE 3000

CMD ["pnpm", "--filter", "@kidogame/web", "start"]
