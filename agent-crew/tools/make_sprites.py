"""Generates hooks/sprites.ts: the pixel-art critters as SVG strings, 2 frames per state.

Run: python tools/make_sprites.py   (stdlib only, no extra dependencies)
"""
import os

W, H = 24, 20

BODY = (221, 120, 86)
BODY_D = (190, 96, 66)
EYE = (60, 38, 38)
WHITE = (245, 245, 250)
BLUE = (48, 60, 150)
BLUE_L = (90, 110, 210)
GREEN = (60, 200, 110)
GREEN_D = (30, 140, 70)
YELLOW = (250, 215, 70)
ORANGE = (245, 150, 50)
RED = (225, 70, 60)
PURPLE = (120, 100, 205)
PURPLE_D = (80, 66, 160)
GRAY = (150, 155, 170)
GRAY_D = (95, 100, 115)
CYAN = (90, 220, 215)
PINK = (240, 130, 190)


class Canvas:
    def __init__(self):
        self.px = {}

    def p(self, x, y, c):
        if 0 <= x < W and 0 <= y < H:
            self.px[(x, y)] = c

    def r(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.p(x, y, c)

    def circle(self, cx, cy, rad, c):
        for y in range(cy - rad, cy + rad + 1):
            for x in range(cx - rad, cx + rad + 1):
                if (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad + 1:
                    self.p(x, y, c)

    def svg(self):
        """One <svg>: horizontal runs of equal colour merged into rects."""
        rects = []
        for y in range(H):
            x = 0
            while x < W:
                col = self.px.get((x, y))
                if col is None:
                    x += 1
                    continue
                x2 = x
                while self.px.get((x2 + 1, y)) == col:
                    x2 += 1
                rects.append('<rect x="%d" y="%d" width="%d" height="1" fill="#%02x%02x%02x"/>' % (x, y, x2 - x + 1, *col))
                x = x2 + 1
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" shape-rendering="crispEdges">%s</svg>' % (W, H, "".join(rects))


def critter(c, f, eyes="open", body_dx=0, lift=0, mouth="flat"):
    """The base critter, standing at the left; f toggles the walk/bob frame."""
    bob = f if lift == 0 else 0
    x0, x1 = 4 + body_dx, 15 + body_dx
    y0, y1 = 8 - bob - lift, 14 - bob - lift
    c.head = (x0, y0)
    c.r(x0, y0, x1, y1, BODY)
    c.r(x0 + 1, y0 - 1, x0 + 2, y0 - 1, BODY)  # ear bump
    c.r(x1 - 2, y0 - 1, x1 - 1, y0 - 1, BODY)
    c.r(x0, y1, x1, y1, BODY_D)  # belly shade
    # legs
    lx = [x0 + 1, x0 + 4, x0 + 7, x0 + 10]
    for i, x in enumerate(lx):
        up = (i + f) % 2
        c.r(x, y1 + 1, x + 1, y1 + 2 - up, BODY)
    ex1, ex2, ey = x0 + 3, x0 + 8, y0 + 3
    if eyes == "open":
        c.r(ex1, ey, ex1, ey + 1, EYE)
        c.r(ex2, ey, ex2, ey + 1, EYE)
    elif eyes == "sleep":
        c.r(ex1 - 1, ey + 1, ex1 + 1, ey + 1, EYE)
        c.r(ex2 - 1, ey + 1, ex2 + 1, ey + 1, EYE)
    elif eyes == "happy":
        for ex in (ex1, ex2):
            c.p(ex - 1, ey + 1, EYE)
            c.p(ex, ey, EYE)
            c.p(ex + 1, ey + 1, EYE)
    elif eyes == "x":
        for ex in (ex1, ex2):
            c.p(ex - 1, ey, EYE)
            c.p(ex + 1, ey, EYE)
            c.p(ex, ey + 1, EYE)
            c.p(ex - 1, ey + 2, EYE)
            c.p(ex + 1, ey + 2, EYE)
    mx = x0 + 5
    if mouth == "flat":
        c.r(mx, y0 + 5, mx + 1, y0 + 5, EYE)
    elif mouth == "smile":
        c.p(mx - 1, y0 + 4, EYE)
        c.r(mx, y0 + 5, mx + 1, y0 + 5, EYE)
        c.p(mx + 2, y0 + 4, EYE)
    elif mouth == "frown":
        c.p(mx - 1, y0 + 5, EYE)
        c.r(mx, y0 + 4, mx + 1, y0 + 4, EYE)
        c.p(mx + 2, y0 + 5, EYE)


def s_idle(f):
    c = Canvas()
    critter(c, 0, eyes="sleep")
    # floating z
    zy = 4 - f
    for (x, y) in [(17, zy), (18, zy), (19, zy), (18, zy + 1), (17, zy + 2), (18, zy + 2), (19, zy + 2)]:
        c.p(x, y, GRAY)
    c.p(21, 1 + f, GRAY_D)
    c.p(22, 1 + f, GRAY_D)
    return c


def s_think(f):
    c = Canvas()
    critter(c, f)
    c.r(15, 1, 22, 5, WHITE)
    c.r(16, 0, 21, 0, WHITE)
    c.r(16, 6, 21, 6, WHITE)
    c.p(14, 7, WHITE)
    c.p(13, 8, WHITE)
    for i in range(3):
        c.p(17 + i * 2, 3, GRAY_D if i == f else GRAY)
    return c


def s_read(f):
    c = Canvas()
    critter(c, f, body_dx=-2)
    c.r(14, 8, 22, 16, BLUE)
    c.r(15, 9, 21, 15, WHITE)
    c.r(18, 9, 18, 15, BLUE_L)
    for y in (10, 12, 14):
        c.r(15 if f else 16, y, 17, y, GREEN_D)
        c.r(19, y, 20 if f else 21, y, GREEN_D)
    return c


def s_search(f):
    c = Canvas()
    critter(c, f, body_dx=-2)
    dy = f
    c.circle(18, 6 + dy, 3, BLUE)
    c.circle(18, 6 + dy, 2, (170, 215, 255))
    c.r(15, 9 + dy, 16, 10 + dy, GRAY_D)
    c.r(13, 11 + dy, 14, 12 + dy, GRAY_D)
    c.p(19, 5 + dy, WHITE)
    return c


def s_edit(f):
    c = Canvas()
    critter(c, f, body_dx=-2)
    c.r(15, 9, 22, 17, WHITE)
    for y in (11, 13, 15):
        c.r(16, y, 21, y, ORANGE if y == 11 else GRAY)
    # pencil
    px = 17 + f * 2
    for i in range(5):
        c.p(px + i, 8 - i + 4, YELLOW)
    c.p(px - 1, 13, GRAY_D)
    return c


def s_bash(f):
    c = Canvas()
    critter(c, f, body_dx=-3)
    c.r(12, 2, 23, 12, BLUE)
    c.r(13, 3, 22, 11, (20, 24, 70))
    c.r(14, 4, 17, 4, GREEN)
    c.r(14, 6, 20, 6, GREEN)
    c.r(14, 8, 18, 8, GREEN)
    if f:
        c.r(20, 8, 21, 9, GREEN)
    c.r(14, 12, 22, 12, BLUE_L)
    return c


def s_test(f):
    c = Canvas()
    critter(c, 0, lift=0, mouth="frown" if f else "flat")
    by = 2 + f
    c.r(2, by + 2, 21, by + 2, GRAY)
    for x in (1, 21):
        c.r(x, by, x + 1, by + 4, BLUE)
        c.r(x + (1 if x == 1 else -1), by + 1, x + (1 if x == 1 else -1), by + 3, BLUE_L)
    c.r(4, by + 3, 5, 8 - f, BODY)  # arms
    c.r(18, by + 3, 19, 8 - f, BODY)
    return c


def s_git(f):
    c = Canvas()
    critter(c, f, body_dx=-3)
    for i in range(3):
        y = 5 + i * 4
        c.r(14, y, 23, y + 3, PURPLE)
        c.r(14, y + 3, 23, y + 3, PURPLE_D)
        c.r(15, y + 1, 18, y + 1, PURPLE_D)
        c.p(21, y + 1, GREEN if (i + f) % 2 else YELLOW)
        c.p(22, y + 1, CYAN)
    return c


def s_build(f):
    c = Canvas()
    critter(c, f, mouth="smile")
    c.r(5, 4, 14, 8, YELLOW)
    c.r(6, 3, 13, 3, YELLOW)
    c.r(3, 8, 16, 8, ORANGE)
    c.r(9, 3, 10, 7, ORANGE)
    # wrench
    wy = 11 + f
    c.r(19, wy, 19, wy + 6, GRAY)
    c.r(18, wy, 18, wy + 1, GRAY_D)
    c.r(20, wy, 20, wy + 1, GRAY_D)
    return c


def s_web(f):
    c = Canvas()
    critter(c, f, body_dx=-3)
    c.circle(18, 7, 5, BLUE)
    c.circle(18, 7, 4, (80, 150, 235))
    sh = f * 2
    c.r(15 + sh // 2, 5, 17 + sh // 2, 6, GREEN)
    c.r(18 + sh // 2, 8, 20, 10, GREEN)
    c.r(13, 14, 22, 14, GRAY_D)
    return c


def s_agent(f):
    c = Canvas()
    critter(c, f, mouth="smile")
    spark = [(17, 3), (20, 1), (21, 6), (18, 8), (23, 3)]
    cols = [YELLOW, RED, ORANGE, PINK, CYAN]
    for i, (x, y) in enumerate(spark):
        sx = x + (1 if (i + f) % 2 else 0)
        c.p(sx, y, cols[i])
        c.p(sx - 1, y, cols[i]) if i % 2 == f else c.p(sx, y - 1, cols[i])
    return c


def s_done(f):
    c = Canvas()
    critter(c, f, eyes="happy", mouth="smile", lift=0)
    c.circle(9, 4, 4, GREEN_D)
    c.circle(9, 4, 3, GREEN)
    for (x, y) in [(7, 4), (8, 5), (9, 4), (10, 3), (11, 2)]:
        c.p(x, y, WHITE)
    for (x, y) in [(3, 1), (15, 2), (4, 6), (14, 5)]:
        c.p(x + (f if x < 9 else -f), y, CYAN)
    return c


def s_fail(f):
    c = Canvas()
    critter(c, 0, eyes="x", mouth="frown")
    for (x, y, rad) in [(9, 5 - f, 2), (12, 3 + f, 2), (15, 5, 1)]:
        c.circle(x, y, rad, GRAY if f else GRAY_D)
    c.p(7, 0, RED)
    c.p(17, 1 + f, RED)
    return c


def crown(c):
    """The main agent's crown, between the ears, drawn last so no overlay hides it."""
    x0, y0 = c.head
    c.r(x0 + 4, y0 - 2, x0 + 7, y0 - 1, YELLOW)
    c.r(x0 + 5, y0 - 1, x0 + 6, y0 - 1, RED)
    c.p(x0 + 4, y0 - 3, YELLOW)
    c.p(x0 + 7, y0 - 3, YELLOW)


def crowned(fn):
    def draw(f):
        c = fn(f)
        crown(c)
        return c
    return draw


STATES = {
    "idle": s_idle, "think": s_think, "read": s_read, "search": s_search, "edit": s_edit,
    "bash": s_bash, "test": s_test, "git": s_git, "build": s_build, "web": s_web,
    "agent": s_agent, "done": s_done, "fail": s_fail,
}

out = ["// Generated by tools/make_sprites.py: do not edit.", "export const SPRITES: Record<string, [string, string]> = {"]
for name, fn in STATES.items():
    a, b = fn(0).svg(), fn(1).svg()
    out.append("  %s: [%r, %r]," % (name, a, b))
out.append("}")
out.append("// The same critters with a crown: the main agent.")
out.append("export const BOSS: Record<string, [string, string]> = {")
for name, fn in STATES.items():
    a, b = crowned(fn)(0).svg(), crowned(fn)(1).svg()
    out.append("  %s: [%r, %r]," % (name, a, b))
out.append("}")
dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "hooks", "sprites.ts")
open(dest, "w", encoding="utf8").write(chr(10).join(out) + chr(10))
print("wrote", dest)
