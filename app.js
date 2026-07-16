const targetInput = document.getElementById("targetInput");
const mealCountInput = document.getElementById("mealCountInput");
const generateBtn = document.getElementById("generateBtn");
const errorDiv = document.getElementById("error");
const menuContainer = document.getElementById("menuContainer");

// ---- Repas selon le nombre choisi ----
const MEAL_SLOTS_BY_COUNT = {
  2: ["dejeuner", "diner"],
  3: ["petit_dejeuner", "dejeuner", "diner"],
  4: ["petit_dejeuner", "dejeuner", "diner", "collation"],
  5: ["petit_dejeuner", "collation_matin", "dejeuner", "diner", "collation_soir"],
};

const LABELS = {
  petit_dejeuner: "Petit-déjeuner",
  dejeuner: "Déjeuner",
  diner: "Dîner",
  collation: "Collation",
  collation_matin: "Collation (matin)",
  collation_soir: "Collation (soir)",
};

// ---- Accordéon garde-manger ----
document.querySelectorAll(".accordion-trigger").forEach((btn) => {
  btn.addEventListener("click", () => {
    const item = btn.closest(".accordion-item");
    item.classList.toggle("open");
  });
});

function getCheckedIngredients(category) {
  const group = document.querySelector(`.checkbox-group[data-category="${category}"]`);
  return Array.from(group.querySelectorAll("input:checked")).map((cb) => cb.value);
}

function updateAccordionCounts() {
  document.querySelectorAll(".accordion-item").forEach((item) => {
    const category = item.dataset.category;
    const checked = getCheckedIngredients(category).length;
    const total = document.querySelectorAll(`.checkbox-group[data-category="${category}"] input`).length;
    item.querySelector(".count").textContent = `${checked}/${total}`;
  });
}

function savePantryState() {
  const state = {
    proteines: getCheckedIngredients("proteines"),
    glucides: getCheckedIngredients("glucides"),
    lipides: getCheckedIngredients("lipides"),
  };
  localStorage.setItem("pantry_state", JSON.stringify(state));
}

// ---- Activation notifications (déclenchée par tap utilisateur, obligatoire sur iOS) ----
const enableNotifsBtn = document.getElementById("enableNotifsBtn");
if (enableNotifsBtn) {
  enableNotifsBtn.addEventListener("click", async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      alert("Les notifications ne sont pas supportées ici.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      alert("Permission refusée.");
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    await subscribeToPush(registration);
    alert("Notifications activées !");
  });
}


function restorePantryState() {
  const saved = localStorage.getItem("pantry_state");
  if (saved) {
    const state = JSON.parse(saved);
    document.querySelectorAll(".checkbox-group input").forEach((cb) => {
      const category = cb.closest(".checkbox-group").dataset.category;
      cb.checked = (state[category] || []).includes(cb.value);
    });
  }
  updateAccordionCounts();
}

document.querySelectorAll(".checkbox-group input").forEach((cb) => {
  cb.addEventListener("change", () => {
    savePantryState();
    updateAccordionCounts();
  });
});

// ---- Roue de macros en SVG ----
function macroRingSVG(protein, carbs, fat, size = 52) {
  const total = protein + carbs + fat || 1;
  const r = size / 2 - 6;
  const circ = 2 * Math.PI * r;
  const pLen = (protein / total) * circ;
  const cLen = (carbs / total) * circ;
  const fLen = (fat / total) * circ;
  const c = size / 2;

  return `
    <svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#E7DCC8" stroke-width="7" />
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#8C6D3F" stroke-width="7"
        stroke-dasharray="${pLen} ${circ - pLen}" transform="rotate(-90 ${c} ${c})" />
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#B8935A" stroke-width="7"
        stroke-dasharray="${cLen} ${circ - cLen}" stroke-dashoffset="${-pLen}" transform="rotate(-90 ${c} ${c})" />
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#D9BE8F" stroke-width="7"
        stroke-dasharray="${fLen} ${circ - fLen}" stroke-dashoffset="${-(pLen + cLen)}" transform="rotate(-90 ${c} ${c})" />
    </svg>
  `;
}

// ---- Appel à la fonction Netlify (la clé API reste côté serveur) ----
async function generateMenu(targetKcal, mealCount) {
  const slots = MEAL_SLOTS_BY_COUNT[mealCount];
  const schemaExample = slots
    .map(
      (key) =>
        `"${key}": {"nom":"...","description":"...","kcal":0,"proteines_g":0,"glucides_g":0,"lipides_g":0,"ingredients":[{"nom":"...","quantite":0,"unite":"g"}]}`
    )
    .join(",\n");

  const proteines = getCheckedIngredients("proteines");
  const glucides = getCheckedIngredients("glucides");
  const lipides = getCheckedIngredients("lipides");

  const contrainteAliments =
    proteines.length || glucides.length || lipides.length
      ? `Utilise UNIQUEMENT les aliments suivants disponibles à la maison, ne propose rien en dehors de cette liste (les légumes, épices, condiments de base et assaisonnements restent libres) :
- Protéines disponibles : ${proteines.join(", ") || "aucune sélectionnée"}
- Glucides disponibles : ${glucides.join(", ") || "aucun sélectionné"}
- Lipides disponibles : ${lipides.join(", ") || "aucun sélectionné"}`
      : "";

  const prompt = `Tu es nutritionniste. Génère un menu du jour équilibré et simple à préparer, réparti sur ${mealCount} repas (${slots
    .map((s) => LABELS[s])
    .join(", ")}), pour un total d'environ ${targetKcal} kcal.

${contrainteAliments}

Pour chaque repas, détaille TOUS les ingrédients avec leur quantité précise en grammes (g) ou millilitres/litres (ml/L).

Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant/après, sans balises markdown, exactement au format :
{
${schemaExample}
}`;

  const response = await fetch("/.netlify/functions/generate-menu", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    throw new Error(`Erreur ${response.status}`);
  }
  return response.json();
}

// ---- Affichage ----
function renderMenu(menu, slots) {
  menuContainer.innerHTML = "";
  slots.forEach((key) => {
    const meal = menu[key];
    if (!meal) return;

    const ingredientsHtml = (meal.ingredients || [])
      .map((ing) => `<li><span>${ing.nom}</span><span>${ing.quantite} ${ing.unite}</span></li>`)
      .join("");

    const card = document.createElement("div");
    card.className = "meal-card";
    card.innerHTML = `
      ${macroRingSVG(meal.proteines_g, meal.glucides_g, meal.lipides_g)}
      <div>
        <p class="meal-label">${LABELS[key]}</p>
        <h3>${meal.nom}</h3>
        <p class="desc">${meal.description}</p>
        <div class="macro-chips">
          <span>${meal.kcal} kcal</span>
          <span>P ${meal.proteines_g}g</span>
          <span>G ${meal.glucides_g}g</span>
          <span>L ${meal.lipides_g}g</span>
        </div>
        <ul class="ingredients">${ingredientsHtml}</ul>
      </div>
    `;
    menuContainer.appendChild(card);
  });
}

// ---- Bouton générer ----
generateBtn.addEventListener("click", async () => {
  errorDiv.textContent = "";
  generateBtn.disabled = true;
  generateBtn.textContent = "Génération…";
  try {
    const target = Number(targetInput.value);
    const mealCount = Number(mealCountInput.value);

    const data = await generateMenu(target, mealCount);
    const textBlock = data.content.find((b) => b.type === "text");
    const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
    const menu = JSON.parse(cleaned);

    renderMenu(menu, MEAL_SLOTS_BY_COUNT[mealCount]);
  } catch (err) {
    errorDiv.textContent = "Erreur : réessaie dans un instant.";
    console.error(err);
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = "Générer le menu du jour";
  }
});

// ---- Service worker ----
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js");
  });
}

// ---- Push notifications ----
async function subscribeToPush(registration) {
  if (!("PushManager" in window)) return;

  // Récupère la clé publique depuis votre fonction Netlify
  const res = await fetch("/.netlify/functions/get-vapid-key");
  const { publicKey } = await res.json();

  const existing = await registration.pushManager.getSubscription();
  if (existing) return; // déjà abonné, pas besoin de refaire

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  // Envoie la subscription à votre serveur pour la stocker
  await fetch("/.netlify/functions/save-subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription),
  });
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// ---- Init ----
restorePantryState();