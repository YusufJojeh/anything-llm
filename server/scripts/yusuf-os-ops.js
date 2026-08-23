#!/usr/bin/env node
const fs = require("fs");
process.env.NODE_ENV === "development"
  ? require("dotenv").config({ path: `.env.${process.env.NODE_ENV}` })
  : require("dotenv").config();
const {
  assessOperationalReadiness,
} = require("../domain/yusufOS/operations/operationalReadiness");

const command = process.argv[2];

if (command !== "validate") {
  console.error("Usage: node scripts/yusuf-os-ops.js validate");
  process.exitCode = 2;
} else {
  const result = assessOperationalReadiness(process.env, fs.existsSync);
  for (const check of result.checks) {
    console.log(
      `${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.message}`
    );
  }
  process.exitCode = result.ok ? 0 : 1;
}
