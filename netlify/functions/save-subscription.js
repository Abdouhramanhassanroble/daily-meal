exports.handler = async (event) => {
  const subscription = JSON.parse(event.body);

  // Pour l'instant on logue juste la subscription (visible dans Netlify -> Functions -> Logs)
  // Copie-la depuis là pour tester l'envoi manuellement.
  console.log("Nouvelle subscription reçue :", JSON.stringify(subscription));

  return { statusCode: 200, body: "OK" };
};