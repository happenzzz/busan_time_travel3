'use strict';
// Pure terrain picking and gesture tracking; camera/DOM integration stays in app.js.
const teleportSupport = (() => {
  function pickGround(origin, direction, heightAt, maxDistance = 6500) {
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (!Number.isFinite(length) || length < 1e-8) return null;
    const d = {x: direction.x / length, y: direction.y / length, z: direction.z / length};
    const point = t => ({x: origin.x + d.x * t, y: origin.y + d.y * t, z: origin.z + d.z * t});
    const gap = t => {const p = point(t); return p.y - heightAt(p.x, p.z);};
    if (![origin.x, origin.y, origin.z].every(Number.isFinite) || gap(0) <= 0) return null;
    // The scene ground never falls below y=0. Upward sky rays cannot reach it unless a hill rises into view.
    const end = d.y < -1e-8 ? Math.min(maxDistance, -origin.y / d.y + 4) : maxDistance;
    let previous = 0;
    for (let t = Math.min(4, end); t <= end; t = Math.min(t + 4, end)) {
      if (gap(t) <= 0) {
        let lo = previous, hi = t;
        for (let i = 0; i < 22; i++) {const mid = (lo + hi) / 2; if (gap(mid) > 0) lo = mid; else hi = mid;}
        const hit = point((lo + hi) / 2);
        if (hit.x < -1500 || hit.x > 1500 || hit.z < -1350 || hit.z > 1450) return null;
        return {x: hit.x, y: heightAt(hit.x, hit.z), z: hit.z};
      }
      if (t === end) break;
      previous = t;
    }
    return null;
  }
  function createGesture() {
    const ids = new Set(); let start = null, cancelled = false;
    return {
      down(id, x, y) {if (!ids.size) {start = {id, x, y}; cancelled = false;} ids.add(id); if (ids.size > 1) cancelled = true;},
      move(id, x, y) {if (start && start.id === id && Math.hypot(x - start.x, y - start.y) > 8) cancelled = true;},
      up(id, x, y) {this.move(id, x, y); const valid = ids.has(id) && ids.size === 1 && start?.id === id && !cancelled; ids.delete(id); if (!ids.size) start = null; return valid;},
      cancel(id) {cancelled = true; ids.delete(id); if (!ids.size) start = null;},
      reset() {ids.clear(); start = null; cancelled = false;}
    };
  }
  return {pickGround, createGesture};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = teleportSupport;
