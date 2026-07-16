const webpush = require("web-push");

webpush.setVapidDetails(
  "mailto:vous@exemple.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

exports.handler = async (event) => {
  const { title, body, subscription } = JSON.parse(event.body);
  await webpush.sendNotification(subscription, JSON.stringify({ title, body }));
  return { statusCode: 200, body: "OK" };
};