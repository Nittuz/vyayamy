/* Pin a non-UTC timezone so day/calendar logic is exercised under real offset
 * conditions instead of silently passing because the CI box happens to be UTC
 * (#152). America/New_York has a meaningful negative offset and observes DST.
 *
 * This must live in globalSetup, not setupFiles: setupFiles run inside Jest's
 * sandbox, where `process.env` is a clone, so assigning TZ there never reaches
 * the real environment V8 reads the timezone from. globalSetup runs
 * un-sandboxed in the main process before workers spawn, so workers inherit
 * the variable for real. */
module.exports = () => {
  process.env.TZ = 'America/New_York';
};
