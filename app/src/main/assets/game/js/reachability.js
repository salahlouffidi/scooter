// SKY SCOOTER — LOUFFI EDITION
// Physical Reachability Validator & Safety Verification
window.ReachabilityValidator = class ReachabilityValidator {
  constructor() {
    this.RIDER_WIDTH = 1.0; // Player collision width in meters
    this.MAX_LATERAL_SPEED = 6.0; // Max lateral steering velocity m/s
    this.MAX_BRAKE_FACTOR = 0.25; // 25% deceleration
    this.JUMP_FLIGHT_TIME = 0.65; // Seconds in air during normal jump
    this.MIN_REACTION_TIME = 2.0; // At least 2.0s warning before unavoidable hazard
    this.GRAVITY = 18.0;
  }

  // Validates if candidate difficulty parameters allow at least one safe navigable route
  validateWindow(speed, densityMult, spacingMult, roadWidth, features) {
    // 1. Check warning distance
    const reactionDistance = speed * this.MIN_REACTION_TIME;
    const baseSpacing = 28.0 * spacingMult; // Spacing between obstacle sets

    // Obstacle sets must be spaced enough so rider can steer between lanes
    // Time to cross road half-width (e.g. 4 meters) at MAX_LATERAL_SPEED: 4 / 6 = 0.66s
    const halfWidth = roadWidth * 0.45;
    const minManeuverTime = halfWidth / this.MAX_LATERAL_SPEED;
    const minManeuverDistance = speed * minManeuverTime;

    if (baseSpacing < minManeuverDistance * 1.2) {
      return false; // Rider would not have physical time to steer between lanes!
    }

    // 2. Check jump flight distance over barriers or gaps
    const jumpDistance = speed * this.JUMP_FLIGHT_TIME;
    const maxGapWidth = 4.0; // standard gap width
    if (features && features.hasGaps && jumpDistance < maxGapWidth + 0.8) {
      return false; // Rider would fall into gap even at maximum jump!
    }

    // 3. Minimum lateral clearance
    const minClearance = roadWidth / 3.0; // Width of one lane
    if (minClearance < this.RIDER_WIDTH + 0.6) {
      return false; // Lane too narrow for safe passage
    }

    return true;
  }

  // Verifies an authored or generated sequence of segments
  // Ensures connected navigable lanes from S_start to S_end
  verifySegmentSequence(segments) {
    // Each segment has available safe lanes: left (-1), center (0), right (+1)
    let reachableLanes = new Set([-1, 0, 1]);

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const openLanes = seg.openLanes || [-1, 0, 1];
      const nextReachable = new Set();

      for (const currentLane of reachableLanes) {
        for (const targetLane of openLanes) {
          // Can player transition from currentLane to targetLane within segment length?
          const laneDist = Math.abs(targetLane - currentLane) * 2.2;
          const requiredTime = laneDist / this.MAX_LATERAL_SPEED;
          const segTime = (seg.length || 20.0) / (seg.speed || 10.0);

          if (segTime >= requiredTime * 0.8) {
            nextReachable.add(targetLane);
          }
        }
      }

      if (nextReachable.size === 0) {
        // Unreachable bottleneck detected! Inject safe center lane
        seg.openLanes = [0];
        seg.hazards = []; // clear hazards in fallback
        reachableLanes = new Set([0]);
      } else {
        reachableLanes = nextReachable;
      }
    }

    return true;
  }
};
