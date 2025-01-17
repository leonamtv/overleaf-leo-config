// @ts-check
const Range = require('./range')
const TrackingProps = require('./tracking_props')

/**
 * @typedef {import("../types").TrackedChangeRawData} TrackedChangeRawData
 */

class TrackedChange {
  /**
   *
   * @param {Range} range
   * @param {TrackingProps} tracking
   */
  constructor(range, tracking) {
    this.range = range
    this.tracking = tracking
  }

  /**
   *
   * @param {TrackedChangeRawData} raw
   * @returns {TrackedChange}
   */
  static fromRaw(raw) {
    return new TrackedChange(
      Range.fromRaw(raw.range),
      TrackingProps.fromRaw(raw.tracking)
    )
  }

  /**
   * @returns {TrackedChangeRawData}
   */
  toRaw() {
    return {
      range: this.range.toRaw(),
      tracking: this.tracking.toRaw(),
    }
  }

  /**
   * Checks whether the tracked change can be merged with another
   * @param {TrackedChange} other
   * @returns {boolean}
   */
  canMerge(other) {
    if (!(other instanceof TrackedChange)) {
      return false
    }
    return (
      this.tracking.type === other.tracking.type &&
      this.tracking.userId === other.tracking.userId &&
      this.range.touches(other.range) &&
      this.range.canMerge(other.range)
    )
  }

  /**
   * Merges another tracked change into this, updating the range and tracking
   * timestamp
   * @param {TrackedChange} other
   * @returns {void}
   */
  merge(other) {
    if (!this.canMerge(other)) {
      throw new Error('Cannot merge tracked changes')
    }
    this.range.merge(other.range)
    this.tracking.ts =
      this.tracking.ts.getTime() > other.tracking.ts.getTime()
        ? this.tracking.ts
        : other.tracking.ts
  }
}

module.exports = TrackedChange
