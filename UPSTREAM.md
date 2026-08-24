# Upstream Sources Record

This file records the exact upstream commits vendored into this repository,
so that later diffs against upstream remain possible.

| Directory | Project | License | Upstream commit | Version | Date vendored |
|---|---|---|---|---|---|
| `plugins/dsh-pocket` | [shaobeichen/dsh-pocket](https://github.com/shaobeichen/dsh-pocket) | GPL-2.0 | `472524a45ef7b1ff6fbd9c3bf50787680a5497c3` fix(proxy): polyfill AbortSignal.any for Android WebView (issue #53) | v1.13.4 | 2026-08-24 |
| `plugins/dsh-web-mobile` | [mexiaosqwq/dsh-web-mobile](https://github.com/mexiaosqwq/dsh-web-mobile) | MIT | `9fbd2c54f4438b65f8fc94cd57afd2806f62a459` fix: toggle the lineage chip reliably on touch pointers | v2.1.1 | 2026-08-24 |

## How to re-diff against upstream

```sh
git clone --depth 1 https://github.com/shaobeichen/dsh-pocket.git /tmp/upstream-dsh-pocket
git clone --depth 1 https://github.com/mexiaosqwq/dsh-web-mobile.git /tmp/upstream-dsh-web-mobile
diff -rq /tmp/upstream-dsh-pocket plugins/dsh-pocket
diff -rq /tmp/upstream-dsh-web-mobile plugins/dsh-web-mobile
```

## Licensing notes

- `dsh-pocket` is **GPL-2.0**: any modified distribution must stay GPL-2.0
  and preserve copyright notice. Acceptable for open-source distribution
  (decision confirmed).
- `dsh-web-mobile` is **MIT**: free to use and modify.