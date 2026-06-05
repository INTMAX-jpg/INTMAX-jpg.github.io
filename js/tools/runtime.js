const BIRTH_YEAR = 2005;
const BIRTH_MONTH = 6;
const BIRTH_DAY = 29;
const BIRTH_HOUR = 5;
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

const createBirthdayDate = (year) => new Date(year, BIRTH_MONTH - 1, BIRTH_DAY, BIRTH_HOUR, 0, 0);

const formatBirthdayDate = (date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

const isZixiBirthday = (date) => date.getMonth() + 1 === BIRTH_MONTH && date.getDate() === BIRTH_DAY;

const getNextBirthday = (now) => {
  let birthday = createBirthdayDate(now.getFullYear());
  if (birthday.getTime() <= now.getTime()) {
    birthday = createBirthdayDate(now.getFullYear() + 1);
  }

  return {
    age: birthday.getFullYear() - BIRTH_YEAR,
    date: birthday,
  };
};

const renderDuration = (prefix, duration) => {
  setRuntimeValue(`${prefix}_days`, duration.days);
  setRuntimeValue(`${prefix}_hours`, duration.hours);
  setRuntimeValue(`${prefix}_minutes`, duration.minutes);
  setRuntimeValue(`${prefix}_seconds`, duration.seconds);
};

const ensureBirthdayTodayMessage = () => {
  let message = document.getElementById("birthday_today_message");
  if (message) return message;

  const nextBirthdayLine = document.querySelector(".next-birthday-countdown");
  message = document.createElement("div");
  message.id = "birthday_today_message";
  message.className = "birthday-today-message";
  message.hidden = true;

  if (nextBirthdayLine) {
    nextBirthdayLine.insertAdjacentElement("beforebegin", message);
  }

  return message;
};

const setBirthdayCountdownVisible = (visible) => {
  document.querySelectorAll(".next-birthday-countdown").forEach((element) => {
    element.hidden = !visible;
  });

  const birthday100Days = document.getElementById("birthday_days");
  if (birthday100Days?.parentElement) {
    birthday100Days.parentElement.hidden = !visible;
  }
};

const renderNextBirthday = (now) => {
  const todayMessage = ensureBirthdayTodayMessage();

  if (isZixiBirthday(now)) {
    setBirthdayCountdownVisible(false);
    if (todayMessage) {
      todayMessage.textContent = `Zixi的${now.getFullYear() - BIRTH_YEAR}岁生日就是今天！`;
      todayMessage.hidden = false;
    }
    return;
  }

  if (todayMessage) todayMessage.hidden = true;
  setBirthdayCountdownVisible(true);

  const nextBirthday = getNextBirthday(now);
  setRuntimeValue("next_birthday_age", nextBirthday.age);
  setRuntimeValue("next_birthday_date", formatBirthdayDate(nextBirthday.date));
  renderDuration("next_birthday", splitDuration(nextBirthday.date.getTime() - now.getTime()));
};

const footerRuntime = () => {
  window.setTimeout(footerRuntime, 1000);

  const now = new Date();
  const startTime = new Date(theme.footerStart);
  const birthday100 = new Date(BIRTHDAY_100);

  renderDuration("runtime", splitDuration(now.getTime() - startTime.getTime()));
  renderNextBirthday(now);
  renderDuration("birthday", splitDuration(birthday100.getTime() - now.getTime()));
};

window.addEventListener("DOMContentLoaded", footerRuntime);