import test from "node:test";
import assert from "node:assert/strict";
import { extractBooking, stripThink, buildSystemPrompt } from "../src/logic.js";

const GOOD = '{"name":"Иван","phone":"+79990000000","service":"Стрижка","datetime":"завтра 18:00"}';

test("booking extracted and hidden", () => {
  const { text, booking } = extractBooking(`Готово!\n[[BOOKING ${GOOD}]]`);
  assert.equal(text, "Готово!");
  assert.equal(booking.name, "Иван");
});
test("missing field / bad json / no tag", () => {
  assert.equal(extractBooking('Ок [[BOOKING {"name":"x"}]]').booking, null);
  assert.deepEqual(extractBooking("Ок [[BOOKING {oops}]]"), { text: "Ок", booking: null });
  assert.equal(extractBooking("просто").text, "просто");
});
test("think stripped", () => assert.equal(stripThink("<think>x</think>Привет"), "Привет"));
test("prompt has shop data", () => {
  const p = buildSystemPrompt({ name: "T", address: "A", phone: "1", hours: "H", services: [{ name: "S", price: "1" }], barbers: [] });
  assert.match(p, /барбершопа «T»/);
  assert.match(p, /- S: 1/);
});
