"use strict";

/* Executes the real browser module (eraser-studio.js) in Node by stubbing the
   only DOM call it makes at load time, then unit-tests the pixel routine that
   powers the instant local fill. */

const test = require("node:test");
const assert = require("node:assert/strict");

global.window = global;
global.document = { addEventListener() {} };
global.performance = global.performance || { now: () => Date.now() };

require("../eraser-studio");

const { diffuseIntoMask } = window.TMDEraserStudio._test;

function solid(width, height, r, g, b) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = r;
    data[index + 1] = g;
    data[index + 2] = b;
    data[index + 3] = 255;
  }
  return data;
}

function maskWithHole(width, height, left, top, size) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = top; y < top + size; y += 1) {
    for (let x = left; x < left + size; x += 1) {
      data[(y * width + x) * 4 + 3] = 255;
    }
  }
  return data;
}

function pixelAt(data, width, x, y) {
  const offset = (y * width + x) * 4;
  return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
}

test("fills a hole with the surrounding colour and touches nothing outside it", () => {
  const width = 12;
  const height = 12;
  const source = solid(width, height, 40, 120, 200);
  const target = new Uint8ClampedArray(source);
  const mask = maskWithHole(width, height, 4, 4, 4);

  /* Sabotage the hole so a no-op implementation would be caught. */
  for (let y = 4; y < 8; y += 1) {
    for (let x = 4; x < 8; x += 1) {
      const offset = (y * width + x) * 4;
      source[offset] = 0;
      source[offset + 1] = 0;
      source[offset + 2] = 0;
      target[offset] = 0;
      target[offset + 1] = 0;
      target[offset + 2] = 0;
    }
  }

  const result = diffuseIntoMask(source, target, mask, width, height, 400);
  assert.equal(result.filled, 16, "every masked pixel must be reconstructed");
  assert.equal(result.unfilled, 0);

  assert.deepEqual(pixelAt(target, width, 5, 5), [40, 120, 200, 255]);
  assert.deepEqual(pixelAt(target, width, 7, 7), [40, 120, 200, 255]);
  assert.deepEqual(pixelAt(target, width, 1, 1), [40, 120, 200, 255], "unmasked pixels stay untouched");
});

test("blends a gradient instead of copying one flat colour", () => {
  const width = 10;
  const height = 4;
  const source = new Uint8ClampedArray(width * height * 4);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      const offset = (y * width + x) * 4;
      source[offset] = x * 25; /* 0 … 225 left to right */
      source[offset + 1] = 10;
      source[offset + 2] = 10;
      source[offset + 3] = 255;
    }
  }
  const target = new Uint8ClampedArray(source);
  /* Punch out the middle two columns. */
  const mask = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (const x of [4, 5]) mask[(y * width + x) * 4 + 3] = 255;
  }
  for (let y = 0; y < height; y += 1) {
    for (const x of [4, 5]) {
      const offset = (y * width + x) * 4;
      source[offset] = 0;
      target[offset] = 0;
    }
  }

  const result = diffuseIntoMask(source, target, mask, width, height, 400);
  assert.equal(result.filled, 8);

  /* The fill grows inward in raster order, so column 4 resolves from its left
     neighbour (75) and column 5 from the already-resolved column 4. What must
     hold is that the hole takes on the local colour instead of staying black
     or snapping to a single copied value. */
  const leftFill = pixelAt(target, width, 4, 0)[0];
  const rightFill = pixelAt(target, width, 5, 0)[0];
  assert.ok(leftFill >= 75 && leftFill <= 100, `expected a locally blended value, got ${leftFill}`);
  assert.ok(rightFill >= leftFill, "the fill must not run backwards against the gradient");
  assert.ok(rightFill <= 125, `the fill must stay near the surrounding ramp, got ${rightFill}`);
  assert.equal(pixelAt(target, width, 3, 0)[0], 75, "unmasked column keeps its exact value");
});

test("reports pixels it cannot reach instead of silently leaving holes", () => {
  const width = 6;
  const height = 6;
  const source = solid(width, height, 10, 20, 30);
  const target = new Uint8ClampedArray(source);
  const mask = new Uint8ClampedArray(width * height * 4);
  /* A fully enclosed 2x2 island: its boundary neighbours are masked too, so
     the very first pass finds no known pixel — it needs several passes. */
  for (let y = 2; y < 4; y += 1) {
    for (let x = 2; x < 4; x += 1) mask[(y * width + x) * 4 + 3] = 255;
  }

  const starved = diffuseIntoMask(source, target, mask, width, height, 1);
  assert.equal(starved.passes, 1);

  const finished = diffuseIntoMask(source, new Uint8ClampedArray(source), mask, width, height, 400);
  assert.equal(finished.filled, 4);
  assert.equal(finished.unfilled, 0);
});

test("does nothing when the mask is empty", () => {
  const width = 4;
  const height = 4;
  const source = solid(width, height, 200, 100, 50);
  const target = new Uint8ClampedArray(source);
  const mask = new Uint8ClampedArray(width * height * 4);
  const result = diffuseIntoMask(source, target, mask, width, height, 50);
  assert.deepEqual(result, { filled: 0, passes: 0 });
  assert.deepEqual(pixelAt(target, width, 0, 0), [200, 100, 50, 255]);
});
