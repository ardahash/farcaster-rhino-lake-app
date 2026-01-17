import json
import os
import matplotlib.pyplot as plt
import matplotlib.image as mpimg

IMAGE_PATH = "rhinolakeTown.png"     # <-- put your image filename here
OUT_JSON = "roadPath.json"
OUT_TS = "roadPath.ts"

# Click points along the blue path in order.
# Controls:
#   Left click: add point
#   Backspace: remove last point
#   Enter: finish + export
#   Esc / close window: quit without saving

points = []

img = mpimg.imread(IMAGE_PATH)
h, w = img.shape[0], img.shape[1]

fig, ax = plt.subplots(figsize=(14, 6))
ax.imshow(img)
ax.set_title("Click points along the BLUE PATH (in order). Enter=save, Backspace=undo")
scat = ax.scatter([], [], s=30)
line, = ax.plot([], [], linewidth=2)

def redraw():
    if points:
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        scat.set_offsets(list(zip(xs, ys)))
        line.set_data(xs, ys)
    fig.canvas.draw_idle()

def on_click(event):
    if event.inaxes != ax:
        return
    if event.button == 1:  # left click
        points.append((int(event.xdata), int(event.ydata)))
        redraw()

def on_key(event):
    if event.key == "backspace":
        if points:
            points.pop()
            redraw()
    elif event.key == "enter":
        if len(points) < 2:
            print("Need at least 2 points.")
            return

        payload = {
            "width": w,
            "height": h,
            "points_px": [{"x": x, "y": y} for x, y in points],
            "points_uv": [{"u": x / w, "v": y / h} for x, y in points],
        }

        with open(OUT_JSON, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)

        ts = "export const RHINO_LAKE_ROAD_PATH_PX = [\n"
        for x, y in points:
            ts += f"  {{ x: {x}, y: {y} }},\n"
        ts += "] as const;\n\n"
        ts += f"export const RHINO_LAKE_IMAGE_SIZE = {{ width: {w}, height: {h} }} as const;\n"
        with open(OUT_TS, "w", encoding="utf-8") as f:
            f.write(ts)

        print(f"Saved {OUT_JSON} and {OUT_TS} with {len(points)} points.")
        plt.close(fig)

cid_click = fig.canvas.mpl_connect("button_press_event", on_click)
cid_key = fig.canvas.mpl_connect("key_press_event", on_key)

plt.show()
