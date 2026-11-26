import '@testing-library/jest-dom/vitest';

// jsdom does not implement scrolling; pages call window.scrollTo to bring an error into view.
window.scrollTo = () => {};
