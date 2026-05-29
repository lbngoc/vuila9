// Load .env.local / .env trước khi Eleventy đọc _data/*.js
// Cần thiết để sheetConfig.js build đúng users_url / bets_url khi dev local
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });  // fallback

const siteConfig = require('./src/_data/siteConfig.js');

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets");

  eleventyConfig.addFilter("dateDisplay", (date) => {
    if (!date) return "";
    return new Date(date).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: siteConfig.timezone,
    });
  });

  eleventyConfig.addFilter("roiDisplay", (roi) => {
    if (roi == null) return "—";
    return (roi * 100).toFixed(1) + "%";
  });

  eleventyConfig.addFilter("where", (array, key, value) => {
    return array ? array.filter((item) => item[key] === value) : [];
  });

  eleventyConfig.addFilter("first", (array, limit) => {
    return array ? array.slice(0, limit || 1) : [];
  });

  eleventyConfig.addFilter("round", (num, decimals) => {
    if (num == null) return "—";
    const factor = Math.pow(10, decimals || 0);
    return (Math.round(num * factor) / factor).toFixed(decimals || 0);
  });

  // Group an array of fixtures by their kickoff date in the configured timezone.
  // Returns: [{ key: "YYYY-MM-DD", label: "Thứ Sáu, 12/06/2026", fixtures: [...] }, ...]
  eleventyConfig.addFilter("groupByDateKey", (fixtures, tz) => {
    if (!fixtures || !fixtures.length) return [];
    const timezone = tz || siteConfig.timezone || "Asia/Ho_Chi_Minh";
    const groups = new Map();
    for (const fixture of fixtures) {
      const d = new Date(fixture.kickoff_at);
      // 'sv-SE' locale produces ISO YYYY-MM-DD — reliable for Map key
      const key = d.toLocaleDateString("sv-SE", { timeZone: timezone });
      if (!groups.has(key)) {
        const label = d.toLocaleDateString("vi-VN", {
          timeZone: timezone,
          weekday: "long",
          day:     "2-digit",
          month:   "2-digit",
          year:    "numeric",
        });
        groups.set(key, { key, label, fixtures: [] });
      }
      groups.get(key).fixtures.push(fixture);
    }
    // Return sorted by date key ascending
    return [...groups.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  });

  return {
    dir: {
      input: "src",
      output: "dist",
      includes: "_includes",
      data: "_data",
    },
    templateFormats: ["njk", "md", "html"],
    htmlTemplateEngine: "njk",
  };
};
