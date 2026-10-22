"""Capture matched native WebGL views and exercise the real chess UI."""

import argparse
import json
from pathlib import Path

from playwright.sync_api import sync_playwright


FRAMES = [
    ("01-overview", None, None),
    ("02-crossings", [15, 12, 20], [0, 0.5, 0]),
    ("03-cliff", [6, 10, 9], [10, 0.5, 0]),
    ("04-ferry", [-4, 8, 10], [-9, 0.5, 0]),
]
INSTRUMENT = """
window.__p = {
  scene, camera, renderer, controls, battlefield, pieceGroups,
  routePreviewLayer, markerLayer, getMarchPath, gridToWorld, THREE,
  getState: () => state, getSelected: () => selectedId,
  getLocked: () => interactionLocked,
  render: () => renderer.render(scene, camera),
  pause: () => renderer.setAnimationLoop(time => {
    battlefield.update(time, reducedMotion.matches);
    controls.update();
  }),
};
"""
WATCH = """(id) => {
  const p = window.__p, T = p.THREE;
  const samples = [], failures = [], gaitFailures = [];
  const terrain = p.battlefield.terrain;
  const { nx, nz, extent } = terrain.userData.grid;
  let active = true, previous = null;
  function record(now) {
    if (!active) return;
    const actor = p.pieceGroups.get(id);
    const boat = p.battlefield.root.getObjectByName('working-ferry');
    p.battlefield.root.updateMatrixWorld(true);
    const at = actor.position;
    for (let k = 0; k < 9; k++) {
      const radius = k === 8 ? 0 : .44;
      const x = at.x + Math.cos(k * Math.PI / 4) * radius;
      const z = at.z + Math.sin(k * Math.PI / 4) * radius;
      const ray = new T.Raycaster(new T.Vector3(x, .565, z),
        new T.Vector3(0, -1, 0), 0, .08);
      let hit = ray.intersectObjects(p.battlefield.decks, true)[0];
      if (!hit) {
        const gx = Math.floor((x + extent.x) / (2 * extent.x) * nx);
        const gz = Math.floor((z + extent.z) / (2 * extent.z) * nz);
        for (const dz of [-1, 0, 1]) for (const dx of [-1, 0, 1]) {
          if (hit) break;
          const xx = gx + dx, zz = gz + dz;
          if (xx < 0 || xx >= nx || zz < 0 || zz >= nz) continue;
          terrain.geometry.setDrawRange((zz * nx + xx) * 6, 6);
          hit = ray.intersectObject(terrain)[0];
        }
        terrain.geometry.setDrawRange(0, Infinity);
      }
      if (!hit || Math.abs(hit.point.y - .54) > .006) {
        failures.push({frame: samples.length, x, z, height: hit?.point.y});
      }
    }
    const joints = [];
    actor.userData.troop.traverse(object => {
      if (object.userData.motionJoint) joints.push(object.rotation.x);
    });
    const wheels = (actor.userData.wheels ?? []).flatMap(wheel => wheel.quaternion.toArray());
    const sample = {time: now, actor: at.toArray(), boat: boat.position.z,
      motion: actor.userData.marchMotion ?? null,
      scale: actor.scale.x, boatSpeed: 0, waiting: false, carrying: false,
      wheels, joints, troopY: actor.userData.troop.position.y};
    if (['waiting', 'riding'].includes(sample.motion)) {
      if (joints.some(value => Math.abs(value) > 1e-8) ||
          Math.abs(sample.troopY - Number(actor.userData.restY)) > 1e-8 ||
          (previous?.motion === sample.motion &&
           wheels.some((value, index) => Math.abs(value - previous.wheels[index]) > 1e-8))) {
        gaitFailures.push({frame: samples.length, motion: sample.motion});
      }
    }
    if (previous && now > previous.time) {
      const boatDelta = Math.abs(sample.boat - previous.boat);
      const distance = at.distanceTo(new T.Vector3(...previous.actor));
      sample.boatSpeed = boatDelta * 1000 / (now - previous.time);
      sample.waiting = boatDelta > 1e-6 && distance < 1e-6;
      sample.carrying = boatDelta > 1e-6 &&
        Math.abs(at.x - boat.position.x) < .001 &&
        Math.abs(at.z - boat.position.z) < .001;
    }
    samples.push(sample); previous = sample;
  }
  function tick(now) {
    if (!active) return;
    setTimeout(() => record(now), 0);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  window.__watch = {
    stop: () => { active = false; return {samples, failures, gaitFailures}; },
    current: () => samples.at(-1),
  };
}"""


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", choices=["before", "after"], required=True)
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--base-url", default="http://127.0.0.1:5173")
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]
    out = repo / "screenshots" / "road-refinement" / args.stage
    out.mkdir(parents=True, exist_ok=True)
    errors, checks, journeys = [], [], []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path="/usr/bin/chromium",
            args=["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
        )
        page = browser.new_page(
            viewport={"width": 1440, "height": 1024},
            device_scale_factor=1,
            reduced_motion="reduce",
            has_touch=True,
        )

        def instrument(route):
            response = route.fetch()
            route.fulfill(response=response, body=response.text() + INSTRUMENT)

        page.route("**/src/main.ts*", instrument)
        page.route("**/favicon.ico", lambda route: route.fulfill(status=204))
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: errors.append(message.text)
                if message.type == "error" else None)
        page.goto(args.base_url, wait_until="networkidle")
        page.wait_for_function("window.__p")
        page.evaluate("window.__p.pause()")

        def snapshot(name, full=False):
            page.evaluate("window.__p.render()")
            page.screenshot(path=str(out / (name + ".png")), full_page=full)
            print("Captured", name, flush=True)

        def camera(position, target):
            page.evaluate("""([position, target]) => {
              const p = window.__p; p.controls.enableDamping = false;
              p.camera.position.fromArray(position); p.controls.target.fromArray(target);
              p.controls.update();
            }""", [position, target])

        def cell(x, y):
            return page.locator(f'.tactical-cell[data-x="{x}"][data-y="{y}"]')

        def move(x, y, tx, ty):
            turn = page.evaluate("window.__p.getState().turn")
            cell(x, y).click()
            cell(tx, ty).click()
            try:
                page.wait_for_function(
                    "turn => window.__p.getState().turn !== turn && !window.__p.getLocked()",
                    arg=turn, timeout=60000,
                )
            except Exception:
                print(json.dumps({"failed_move": [x, y, tx, ty], "errors": errors,
                                  "state": page.evaluate("window.__p.getState()"),
                                  "locked": page.evaluate("window.__p.getLocked()")},
                                 ensure_ascii=False), flush=True)
                raise

        def reset():
            page.locator("#reset-button").click()
            page.wait_for_function("!window.__p.getLocked()")
            page.wait_for_function(
                '!document.querySelector("#battle-toast").classList.contains("show")'
            )

        def synced():
            assert page.evaluate("""() => window.__p.getState().pieces.every(piece =>
              document.querySelector(`.tactical-cell[data-x="${piece.x}"][data-y="${piece.y}"]`)
                .dataset.pieceId === piece.id)""")

        for name, position, target in FRAMES:
            if position:
                camera(position, target)
            snapshot(name)

        if args.verify:
            page.locator("#tactical-toggle").click()
            assert page.locator(".tactical-cell:not(.empty)").count() == 32
            for piece in page.evaluate('window.__p.getState().pieces.filter(p => p.side === "red")'):
                cell(piece["x"], piece["y"]).click()
                assert page.evaluate("window.__p.getSelected()") == piece["id"]
            checks.append("All 16 initial red pieces selectable; 32 physical pieces")
            reset()
            page.evaluate("""() => {
              window.__nativeRaf = window.requestAnimationFrame;
              window.requestAnimationFrame = callback =>
                window.__nativeRaf(time => callback(time - 100));
            }""")
            move(0, 6, 0, 5)
            page.evaluate("() => { window.requestAnimationFrame = window.__nativeRaf; }")
            synced()
            checks.append("Animation uses its first RAF timestamp; an earlier frame-clock origin cannot lock a move")
            reset()
            cell(1, 9).focus()
            page.keyboard.press("Enter")
            before = page.evaluate("JSON.stringify(window.__p.getState())")
            cell(1, 8).click()
            assert page.evaluate("JSON.stringify(window.__p.getState())") == before
            cell(2, 7).hover()
            assert page.evaluate("window.__p.routePreviewLayer.children.length") == 2
            cell(1, 9).focus()
            for key in ["ArrowRight", "ArrowUp", "ArrowUp", "Enter"]:
                page.keyboard.press(key)
            page.wait_for_function('window.__p.getState().turn === "black" && !window.__p.getLocked()')
            synced()
            checks.append("Illegal horse endpoint rejected; keyboard legal move and route preview")

            reset()
            move(0, 6, 0, 5)
            move(6, 3, 6, 4)
            cell(0, 5).click()
            cell(0, 4).hover()
            assert "渡船" in page.locator("#route-caption").inner_text()
            move(0, 5, 0, 4)
            synced()
            reset()
            move(8, 6, 8, 5)
            move(0, 3, 0, 4)
            cell(8, 5).click()
            cell(8, 4).hover()
            assert "栈道" in page.locator("#route-caption").inner_text()
            move(8, 5, 8, 4)
            synced()
            checks.append("Real legal soldier ferry and cliff crossings finish at their logical stations")

            for label, setup, start, end in [
                ("north-to-south", (6, 6, 6, 5), (1, 2), (1, 9)),
                ("south-to-north", None, (1, 7), (1, 0)),
            ]:
                reset()
                page.emulate_media(reduced_motion="reduce")
                if setup:
                    move(*setup)
                page.emulate_media(reduced_motion="no-preference")
                page.locator("#speed-select").select_option("1")
                piece = page.evaluate("""([x,y]) => window.__p.getState().pieces.find(
                  piece => piece.x === x && piece.y === y)""", list(start))
                camera([-4, 7, 8], [-9.6, .5, 0])
                page.evaluate(WATCH, piece["id"])
                cell(*start).click()
                cell(*end).click()
                if label == "north-to-south":
                    page.wait_for_function("window.__watch.current()?.waiting", timeout=60000)
                    snapshot("05-ferry-waiting")
                page.wait_for_function("window.__watch.current()?.carrying", timeout=60000)
                if label == "north-to-south":
                    snapshot("06-ferry-carriage")
                page.wait_for_function("!window.__p.getLocked()", timeout=60000)
                record = page.evaluate("window.__watch.stop()")
                (out / (label + "-frames.json")).write_text(json.dumps(record, indent=2))
                assert not record["failures"], record["failures"][:5]
                assert not record["gaitFailures"], record["gaitFailures"][:5]
                assert len(record["samples"]) > 20
                max_speed = max(sample["boatSpeed"] for sample in record["samples"])
                assert max_speed <= 2.6 * 1.08, max_speed
                assert any(sample["carrying"] for sample in record["samples"])
                if setup:
                    assert any(sample["waiting"] for sample in record["samples"])
                assert all(abs(sample["actor"][1] - .545) < 1e-8
                           and abs(sample["scale"] - .68) < 1e-8
                           for sample in record["samples"])
                assert page.evaluate("window.__p.getState().pieces.length") == 31
                assert cell(*end).get_attribute("data-piece-id") == piece["id"]
                synced()
                journeys.append({"direction": label, "frames": len(record["samples"]),
                                 "footprint_rays": len(record["samples"]) * 9,
                                 "unsupported_samples": len(record["failures"]),
                                 "maximum_boat_speed": max_speed,
                                 "elapsed_seconds": (record["samples"][-1]["time"]
                                                     - record["samples"][0]["time"]) / 1000})
                print("Verified actual ferry journey", label, flush=True)
            checks.append("Normal-motion cannon capture through the real ferry in both directions")

            page.emulate_media(reduced_motion="reduce")
            reset()
            page.locator("#view-button").click()
            page.set_viewport_size({"width": 390, "height": 844})
            snapshot("07-mobile", full=True)
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            move(0, 6, 0, 5)
            synced()
            checks.append("390px mobile layout and synchronized move without horizontal overflow")
            page.set_viewport_size({"width": 1440, "height": 1024})
            reset()
            move(6, 6, 6, 5)
            page.emulate_media(reduced_motion="no-preference")
            cell(1, 2).click()
            cell(1, 9).click()
            page.locator("#reset-button").click()
            page.wait_for_timeout(1000)
            assert page.evaluate("window.__p.getState().pieces.length") == 32
            assert page.evaluate('window.__p.getState().turn === "red" && !window.__p.getLocked()')
            assert page.locator(".last-move").count() == 0
            synced()
            checks.append("Reset cancels in-flight transport with no stale logical move")

        report = {"stage": args.stage, "viewport": [1440, 1024], "frames": FRAMES,
                  "checks": checks, "ferry_journeys": journeys, "console_errors": errors}
        (out / "verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
        assert not errors, errors
        browser.close()
        print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    run()
