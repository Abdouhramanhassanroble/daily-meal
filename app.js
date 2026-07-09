const controlsDiv = document.getElementById("controls");
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

// ---- Filtres garde-manger ----
function getCheckedIngredients(category) {
  const group = document.querySelector(`.checkbox-group[data-category="${category}"]`);
  return Array.from(group.querySelectorAll("input:checked")).map((cb) => cb.value);
}

function savePantryState() {
  const state = {
    proteines: getCheckedIngredients("proteines"),
    glucides: getCheckedIngredients("glucides"),
    lipides: getCheckedIngredients("lipides"),
  };
  localStorage.setItem("pantry_state", JSON.stringify(state));
}

function restorePantryState() {
  const saved = localStorage.getItem("pantry_state");
  if (!saved) return;
  const state = JSON.parse(saved);
  document.querySelectorAll(".checkbox-group input").forEach((cb) => {
    const category = cb.closest(".checkbox-group").dataset.category;
    cb.checked = (state[category] || []).includes(cb.value);
  });
}

document.querySelectorAll(".checkbox-group input").forEach((cb) => {
  cb.addEventListener("change", savePantryState);
});

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
    card.className = "card";
    card.innerHTML = `
      <strong>${LABELS[key]}</strong>
      <h3 style="margin:6px 0;">${meal.nom}</h3>
      <p style="color:#57534A;">${meal.description}</p>
      <p style="font-size:13px;">${meal.kcal} kcal · P ${meal.proteines_g}g · G ${meal.glucides_g}g · L ${meal.lipides_g}g</p>
      <ul class="ingredients">${ingredientsHtml}</ul>
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

// ---- Init ----
restorePantryState();