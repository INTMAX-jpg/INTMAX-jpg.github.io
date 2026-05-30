const BIRTHDAY_100 = "2105/6/29 05:00:00";

const splitDuration = (milliseconds) => {
  const safeMilliseconds = Math.max(0, milliseconds);
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.floor(safeMilliseconds / dayMs);
  const hours = Math.floor((safeMilliseconds % dayMs) / (60 * 60 * 1000));
  const minutes = Math.floor((safeMilliseconds % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((safeMilliseconds % (60 * 1000)) / 1000);

  return { days, hours, minutes, seconds };
};

const setRuntimeValue = (id, value) => {
  const element = document.getElementById(id);
  if (element) element.innerHTML = value;
};

const renderDuration = (prefix, duration) => {
  setRuntimeValue(`${prefix}_days`, duration.days);
  setRuntimeValue(`${prefix}_hours`, duration.hours);
  setRuntimeValue(`${prefix}_minutes`, duration.minutes);
  setRuntimeValue(`${prefix}_seconds`, duration.seconds);
};

const footerRuntime = () => {
  window.setTimeout(footerRuntime, 1000);

  const now = new Date();
  const startTime = new Date(theme.footerStart);
  const birthday100 = new Date(BIRTHDAY_100);

  renderDuration("runtime", splitDuration(now.getTime() - startTime.getTime()));
  renderDuration("birthday", splitDuration(birthday100.getTime() - now.getTime()));
};

window.addEventListener("DOMContentLoaded", footerRuntime);