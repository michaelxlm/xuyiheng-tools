#!/usr/bin/env bash
# =============================================================================
# apply-nginx-hardening.sh · xuyiheng.com GSC 403 归一片段落地（39.107.225.222）
#
# CI 用法（runner 已持有仓库专用密钥）：
#   ssh -i /root/.ssh/admin.xuyiheng.com_id_ed25519 -o StrictHostKeyChecking=accept-new \
#       root@39.107.225.222 'bash -s' < deploy/apply-nginx-hardening.sh
# 手工用法（服务器终端）：
#   bash /www/wwwroot/uni-web/deploy/apply-nginx-hardening.sh
#
# 幂等；优先落地到宝塔 extension 目录，未找到则从生效 vhost 里定位裸域 server 块
# 插入 include。nginx -t 不通过自动回滚，静态站部署不受影响；完全找不到落点则
# 明确 [skip] 并给出手工粘贴路径，避免「假成功」。
# =============================================================================
set -u

ROOT=/www/wwwroot/uni-web
NAME=nginx-index-hardening.conf
SRC="$ROOT/deploy/$NAME"
NGINX=$(command -v nginx || echo /www/server/nginx/sbin/nginx)

if [ ! -f "$SRC" ]; then
  echo "[skip] 片段未部署：$SRC"
  exit 0
fi
if [ ! -x "$NGINX" ]; then
  echo "[skip] nginx 不存在：$NGINX，请手工应用 $SRC"
  exit 0
fi

apply_to_extension_dir() {
  DIR=$1
  [ -d "$DIR" ] || return 1
  DST="$DIR/$NAME"
  BAK_DIR="$DIR/.backup"
  mkdir -p "$BAK_DIR" || return 1
  if [ -f "$DST" ]; then
    cp -f "$DST" "$BAK_DIR/$NAME" || return 1
  fi
  if ! cp -f "$SRC" "$DST"; then
    echo "[warn] 写入失败：$DST"
    return 1
  fi
  if ! "$NGINX" -t >/dev/null 2>&1; then
    if [ -f "$BAK_DIR/$NAME" ]; then
      mv -f "$BAK_DIR/$NAME" "$DST"
    else
      rm -f "$DST"
    fi
    echo "[warn] nginx -t 未通过，已回滚：$DST"
    return 1
  fi
  if ! "$NGINX" -s reload >/dev/null 2>&1; then
    echo "[warn] reload 失败，配置已落盘，下次 reload 生效：$DST"
  fi
  echo "[ok] 已落地并 reload：$DST"
  return 0
}

for D in \
  /www/server/panel/vhost/nginx/extension/xuyiheng.com \
  /www/server/panel/vhost/nginx/extension/uni-web
do
  if apply_to_extension_dir "$D"; then
    exit 0
  fi
done

VHOST=$(grep -rlE 'server_name[[:space:]]+xuyiheng\.com;' \
  /www/server/panel/vhost/nginx /etc/nginx/conf.d /etc/nginx/sites-enabled 2>/dev/null | head -n 1)

if [ -n "$VHOST" ] && command -v python3 >/dev/null 2>&1; then
  BAK="$VHOST.bak-gsc403-$(date +%Y%m%d%H%M%S)"
  cp -f "$VHOST" "$BAK" || BAK=""
  if python3 - "$VHOST" "$SRC" <<'PY'
import re
import sys

path, snippet = sys.argv[1], sys.argv[2]
include = "    include %s;\n" % snippet
text = open(path, "r", encoding="utf-8", errors="surrogateescape").read()
if "nginx-index-hardening.conf" in text:
    sys.exit(0)

lines = text.splitlines(keepends=True)
i = 0
while i < len(lines):
    if not re.search(r"\bserver\s*\{", lines[i]):
        i += 1
        continue
    start = i
    depth = lines[i].count("{") - lines[i].count("}")
    i += 1
    while i < len(lines) and depth > 0:
        depth += lines[i].count("{") - lines[i].count("}")
        i += 1
    block = "".join(lines[start:i])
    directive = re.search(r"^\s*server_name\s+([^;]+);", block, re.M)
    if directive and re.search(r"(^|\s)xuyiheng\.com($|\s)", directive.group(1)) \
            and "www.xuyiheng.com" not in directive.group(1) and i - 1 > start:
        lines.insert(i - 1, include)
        open(path, "w", encoding="utf-8", errors="surrogateescape").write("".join(lines))
        sys.exit(0)

sys.exit(1)
PY
  then
    if "$NGINX" -t >/dev/null 2>&1; then
      "$NGINX" -s reload >/dev/null 2>&1 || echo "[warn] reload 失败，下次 reload 生效"
      echo "[ok] 已在 vhost 插入 include 并 reload：$VHOST（备份 $BAK）"
      exit 0
    fi
    [ -n "$BAK" ] && mv -f "$BAK" "$VHOST"
    echo "[warn] nginx -t 未通过，已回滚：$VHOST"
    exit 0
  fi
  [ -n "$BAK" ] && mv -f "$BAK" "$VHOST"
fi

echo "[skip] 未找到可安全落地的 nginx 位置，请手工把 $SRC 粘进 xuyiheng.com 的 server { }"
exit 0
