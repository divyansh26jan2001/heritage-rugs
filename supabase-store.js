/* Rugvaya Supabase application layer.
   All persistent marketplace records are written to Supabase; no localStorage is used. */
const db = window.rugvayaSupabase;
const appState = window.rugvayaState;
const el = id => document.getElementById(id);
let authUser = null;
let authProfile = null;
let afterSignIn = null;
let lastLoadedUserId = undefined;
let adminMode = false;

const statusFromDb = value => ({
  pending: "Processing",
  confirmed: "Processing",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded"
}[String(value || "").toLowerCase()] || "Processing");

const statusToDb = value => ({
  Processing: "processing",
  Shipped: "shipped",
  Delivered: "delivered",
  Cancelled: "cancelled",
  Refunded: "refunded"
}[value] || "processing");

const fail = (context, error) => {
  console.error("[Rugvaya]", context, error);
  const message = error?.message || String(error || "Unknown error");
  window.toast?.(context + ": " + message);
};

const requireAuth = (action, message = "Sign in to save your changes to your Rugvaya account.") => {
  if (authUser) return true;
  afterSignIn = action || null;
  window.openCustomerLogin();
  window.toast?.(message);
  return false;
};

const isAdmin = () => authProfile?.role === "admin";
const currentShop = () => appState.shops.find(s => String(s.id) === String(window.rugvayaCurrentSellerShopId)) || null;
const productByStorefrontId = id => appState.products.find(p => String(p.id) === String(id));
const shopByStorefrontId = id => appState.shops.find(s => String(s.id) === String(id));
const slugBase = value => String(value || "").toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 55) || "rugvaya-shop";

function mapShop(row) {
  return {
    id: Number(row.storefront_id),
    dbId: row.id,
    ownerId: row.owner_id,
    name: row.name,
    slug: row.slug,
    ownerName: row.owner_name || "",
    ownerEmail: row.owner_email || "",
    location: row.location || "",
    description: row.description || "",
    initials: row.initials || String(row.name || "R").slice(0, 2).toUpperCase(),
    status: row.status,
    demo: !!row.is_sample,
    createdAt: row.created_at ? row.created_at.slice(0, 10) : "",
    banner: row.banner_url || ""
  };
}

function mapProduct(row, shops) {
  const shop = shops.find(s => s.dbId === row.shop_id);
  const images = Array.isArray(row.image_urls) ? row.image_urls : [];
  const cover = row.cover_image_url || images[0] || "";
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const sizes = Array.isArray(row.sizes) ? row.sizes : [];
  return {
    id: Number(row.storefront_id),
    dbId: row.id,
    shopId: shop ? shop.id : null,
    shopDbId: row.shop_id,
    name: row.name,
    category: row.category || "Traditional",
    price: Number(row.price || 0),
    currency: row.currency || "USD",
    stock: Number(row.stock || 0),
    size: row.size || sizes[0] || "",
    sizes,
    style: row.style || "",
    material: row.material || "",
    color: row.color || "",
    technique: row.technique || "",
    origin: row.origin || "",
    tags,
    tag: row.tag || tags[0] || "Rug",
    status: row.status === "published" ? "Published" : "Draft",
    description: row.description || "",
    longDescription: row.long_description || "",
    careInstructions: row.care_instructions || "",
    image: cover,
    images: cover && !images.includes(cover) ? [cover, ...images] : images,
    photoNote: row.photo_note || "",
    imageCredit: row.image_credit || "",
    imageCreditUrl: row.image_credit_url || "",
    referenceSource: row.reference_source || "",
    referenceUrl: row.reference_url || "",
    priceNote: row.price_note || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapOrder(row, lines, products, shops) {
  const items = lines.filter(line => line.order_id === row.id).map(line => {
    const product = products.find(p => p.dbId === line.product_id);
    const shop = shops.find(s => s.dbId === line.shop_id);
    return {
      productId: product ? product.id : line.product_id,
      name: line.product_name,
      shopId: shop ? shop.id : null,
      qty: Number(line.quantity),
      price: Number(line.unit_price)
    };
  });
  return {
    id: row.order_number,
    dbId: row.id,
    name: row.customer_name,
    email: row.customer_email,
    phone: row.customer_phone || "",
    shipping: row.shipping_address || {},
    date: row.created_at ? row.created_at.slice(0, 10) : "",
    items,
    total: Number(row.total || 0),
    status: statusFromDb(row.status),
    paymentStatus: row.payment_status,
    tracking: row.tracking_number || "",
    sample: false
  };
}

async function readCurrentProfile() {
  if (!authUser) return null;
  const { data, error } = await db.from("profiles")
    .select("id,email,full_name,avatar_url,role,created_at,updated_at")
    .eq("id", authUser.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function refreshDatabaseState({ render = true } = {}) {
  if (!db) throw new Error("Supabase client is not available.");
  const [shopResult, productResult, settingsResult] = await Promise.all([
    db.from("shops").select("*").order("created_at", { ascending: false }),
    db.from("products").select("*").order("created_at", { ascending: false }),
    db.from("store_settings").select("*").eq("id", true).maybeSingle()
  ]);
  if (shopResult.error) throw shopResult.error;
  if (productResult.error) throw productResult.error;
  if (settingsResult.error) throw settingsResult.error;

  appState.shops = (shopResult.data || []).map(mapShop);
  appState.products = (productResult.data || []).map(row => mapProduct(row, appState.shops));

  const orderResult = await db.from("orders").select("*").order("created_at", { ascending: false });
  if (orderResult.error) throw orderResult.error;
  const orderRows = orderResult.data || [];
  let lineRows = [];
  if (orderRows.length) {
    const linesResult = await db.from("order_items")
      .select("*").in("order_id", orderRows.map(row => row.id));
    if (linesResult.error) throw linesResult.error;
    lineRows = linesResult.data || [];
  }
  appState.orders = orderRows.map(row => mapOrder(row, lineRows, appState.products, appState.shops));

  if (authUser) {
    const [cartResult, wishResult] = await Promise.all([
      db.from("cart_items").select("product_id,quantity").eq("user_id", authUser.id),
      db.from("wishlist_items").select("product_id").eq("user_id", authUser.id)
    ]);
    if (cartResult.error) throw cartResult.error;
    if (wishResult.error) throw wishResult.error;
    appState.cart = (cartResult.data || []).map(row => {
      const product = appState.products.find(p => p.dbId === row.product_id);
      return product ? { productId: product.id, qty: Number(row.quantity) } : null;
    }).filter(Boolean);
    appState.wishlist = (wishResult.data || []).map(row => {
      const product = appState.products.find(p => p.dbId === row.product_id);
      return product ? product.id : null;
    }).filter(id => id !== null);
  } else {
    appState.cart = [];
    appState.wishlist = [];
  }

  if (settingsResult.data) {
    appState.seoTitle = settingsResult.data.seo_title;
    appState.seoDescription = settingsResult.data.seo_description;
    appState.seoTagline = settingsResult.data.seo_tagline;
  }

  if (authUser && isAdmin()) {
    const applications = await db.from("seller_applications").select("*").order("applied_at", { ascending: false });
    if (applications.error) throw applications.error;
    appState.sellerApplications = applications.data || [];
    const profiles = await db.from("profiles").select("id,email,full_name,role,created_at");
    if (profiles.error) throw profiles.error;
    appState.customers = profiles.data || [];
  } else {
    appState.sellerApplications = [];
    appState.customers = [];
  }

  appState.user = authUser;
  appState.profile = authProfile;
  window.updateHeaderCounts?.();
  if (render) {
    window.renderProducts?.();
    if (location.hash === "#shops" || location.hash.startsWith("#shop/") || location.hash === "#seller-dashboard") {
      window.routeHash?.();
    }
  }
  return appState;
}

function updateAccountControls() {
  document.querySelectorAll('.icon-action[onclick="openCustomerLogin()"] .action-label')
    .forEach(node => { node.textContent = authUser ? "My account" : "Sign in"; });
  document.querySelectorAll('.icon-action[onclick="openCustomerLogin()"] .symbol')
    .forEach(node => { node.textContent = authUser ? "♙" : "♙"; });
}

async function applySession(session, force = false) {
  const nextUser = session?.user || null;
  const nextId = nextUser?.id || null;
  if (!force && lastLoadedUserId === nextId) return;
  lastLoadedUserId = nextId;
  authUser = nextUser;
  authProfile = null;
  adminMode = false;
  appState.user = authUser;
  appState.profile = null;

  try {
    if (authUser) authProfile = await readCurrentProfile();
    adminMode = isAdmin();
    await refreshDatabaseState({ render: true });
    updateAccountControls();
    if (authUser && adminMode) {
      openAdminWorkspace();
    } else if (authUser && location.hash === "#seller-dashboard") {
      await openSellerWorkspaceForCurrentUser();
    }
    if (afterSignIn) {
      const action = afterSignIn;
      afterSignIn = null;
      action();
    }
  } catch (error) {
    fail("Could not load your Rugvaya account/database", error);
  }
}

function openAdminWorkspace() {
  if (!isAdmin()) {
    window.toast?.("This account does not have Rugvaya administrator access.");
    return;
  }
  const store = el("storefront");
  const admin = el("adminApp");
  if (store) store.classList.add("hidden");
  if (admin) admin.classList.add("active");
  window.adminTab?.("overview", el("adminApp")?.querySelector('.admin-nav[data-tab="overview"]'));
}

function openAccountModal() {
  const profile = authProfile || {};
  const orders = appState.orders || [];
  const orderMarkup = orders.length
    ? '<div class="customer-history"><h3>Your recent orders</h3><table class="data-table"><thead><tr><th>Order</th><th>Date</th><th>Status</th><th>Total</th></tr></thead><tbody>' +
      orders.slice(0, 10).map(o => '<tr><td>' + window.escapeHtml(o.id) + '</td><td>' + window.escapeHtml(o.date) + '</td><td>' + window.escapeHtml(o.status) + '</td><td>' + window.money(o.total) + '</td></tr>').join("") +
      '</tbody></table></div>'
    : '<p class="muted-note">Your orders will appear here after checkout.</p>';
  window.showModal("Your Rugvaya account",
    '<p class="muted-note">Signed in as <b>' + window.escapeHtml(authUser.email || "") +
    '</b><br>Account type: ' + window.escapeHtml(profile.role || "customer") + '</p>' +
    (isAdmin() ? '<button class="btn" onclick="openRugvayaAdmin()">Open admin dashboard</button>' : "") +
    (profile.role === "seller" ? '<button class="btn btn-light" onclick="location.hash=\'#seller-dashboard\';closeModal()">Open seller dashboard</button>' : '') +
    orderMarkup +
    '<div class="modal-actions"><button class="btn btn-light" onclick="signOutRugvaya()">Sign out</button><button class="btn btn-light" onclick="closeModal()">Close</button></div>');
}

function showAuthForm(mode = "signin") {
  if (authUser) return openAccountModal();
  const signup = mode === "signup";
  const body = signup
    ? '<p class="muted-note">Create a customer account. You can apply to open a seller shop after signing in.</p>' +
      '<form onsubmit="routeRugvayaSignUp(event)">' +
      '<div class="field"><label>Full name</label><input id="authFullName" autocomplete="name" required maxlength="100"></div>' +
      '<div class="field"><label>Email address</label><input id="authEmail" type="email" autocomplete="email" required></div>' +
      '<div class="field"><label>Password</label><input id="authPassword" type="password" autocomplete="new-password" minlength="8" required></div>' +
      '<button class="btn" type="submit" style="width:100%">Create account</button></form>' +
      '<p class="muted-note">Already registered? <a href="#" onclick="showRugvayaSignIn();return false">Sign in</a></p>'
    : '<p class="muted-note">Sign in to save your cart, manage orders or open your seller dashboard.</p>' +
      '<form onsubmit="routeDemoSignIn(event)">' +
      '<div class="field"><label>Email address</label><input id="authEmail" type="email" autocomplete="email" required></div>' +
      '<div class="field"><label>Password</label><input id="authPassword" type="password" autocomplete="current-password" required></div>' +
      '<button class="btn" type="submit" style="width:100%">Sign in</button></form>' +
      '<p class="muted-note">New to Rugvaya? <a href="#" onclick="showRugvayaSignUp();return false">Create an account</a></p>';
  window.showModal(signup ? "Create your account" : "Sign in to Rugvaya", body);
}

async function signInRugvaya(event) {
  event.preventDefault();
  const email = el("authEmail")?.value.trim().toLowerCase();
  const password = el("authPassword")?.value;
  if (!email || !password) return;
  const button = el("modalContent")?.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (button) button.disabled = false;
  if (error) return fail("Sign in failed", error);
  window.closeModal?.();
  await applySession(data.session, true);
  window.toast?.("Signed in to Rugvaya.");
}

async function signUpRugvaya(event) {
  event.preventDefault();
  const fullName = el("authFullName")?.value.trim();
  const email = el("authEmail")?.value.trim().toLowerCase();
  const password = el("authPassword")?.value;
  if (!fullName || !email || !password) return;
  if (password.length < 8) return window.toast?.("Use a password with at least 8 characters.");
  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: location.origin + location.pathname
    }
  });
  if (error) return fail("Account creation failed", error);
  window.closeModal?.();
  if (data.session) {
    await applySession(data.session, true);
    window.toast?.("Your Rugvaya account has been created.");
  } else {
    window.showModal?.("Check your email",
      '<p class="muted-note">Supabase sent a confirmation link to <b>' + window.escapeHtml(email) +
      '</b>. Confirm the address, then return here and sign in.</p><button class="btn" onclick="closeModal();openCustomerLogin()">Continue to sign in</button>');
  }
}

async function signOutRugvaya() {
  const { error } = await db.auth.signOut();
  if (error) return fail("Sign out failed", error);
  window.closeModal?.();
  window.rugvayaCurrentSellerShopId = null;
  await applySession(null, true);
  if (el("adminApp")) el("adminApp").classList.remove("active");
  if (el("storefront")) el("storefront").classList.remove("hidden");
  location.hash = "#home";
  window.toast?.("Signed out.");
}

window.openRugvayaAdmin = openAdminWorkspace;
window.openCustomerLogin = () => authUser ? openAccountModal() : showAuthForm("signin");
window.showRugvayaSignIn = () => showAuthForm("signin");
window.showRugvayaSignUp = () => showAuthForm("signup");
window.routeDemoSignIn = signInRugvaya;
window.routeRugvayaSignUp = signUpRugvaya;
window.signOutRugvaya = signOutRugvaya;
window.adminDemoPasswordLogin = signInRugvaya;
window.adminLogout = signOutRugvaya;
window.backToStore = () => {
  el("adminApp")?.classList.remove("active");
  el("storefront")?.classList.remove("hidden");
  window.scrollTo(0, 0);
};

window.openSellerRegistration = () => {
  if (!requireAuth(() => window.openSellerRegistration(), "Sign in or create an account before applying to open a shop.")) return;
  const existing = appState.shops.find(s => s.ownerId === authUser.id);
  if (existing) {
    window.rugvayaCurrentSellerShopId = existing.id;
    location.hash = "#seller-dashboard";
    window.renderRugvayaSellerDashboard?.();
    return;
  }
  const name = authProfile?.full_name || authUser.user_metadata?.full_name || "";
  window.showModal("Apply to open a shop on Rugvaya",
    '<p class="muted-note">Your shop and products remain private until an admin approves your application. Your signed-in email will be used for this application.</p>' +
    '<form onsubmit="submitSellerRegistration(event)"><div class="market-form-grid">' +
    '<div class="field"><label>Shop name</label><input id="sellerShopName" required maxlength="80" placeholder="e.g. Jaipur Loom House"></div>' +
    '<div class="field"><label>Owner name</label><input id="sellerOwnerName" required maxlength="100" value="' + window.escapeHtml(name) + '"></div>' +
    '<div class="field full"><label>Account email</label><input type="email" value="' + window.escapeHtml(authUser.email || "") + '" disabled></div>' +
    '<div class="field"><label>City and country</label><input id="sellerLocation" required placeholder="Jaipur, India"></div>' +
    '<div class="field full"><label>About your shop</label><textarea id="sellerDescription" required rows="4" maxlength="1200" placeholder="Tell buyers about your rugs, craft and shop story."></textarea></div>' +
    '</div><div class="shop-application-note">Rugvaya admin approval is required before your shop or products become public.</div>' +
    '<button class="btn" type="submit">Submit shop application →</button></form>');
};

window.submitSellerRegistration = async event => {
  event.preventDefault();
  if (!authUser) return window.openCustomerLogin();
  const name = el("sellerShopName")?.value.trim();
  const owner = el("sellerOwnerName")?.value.trim();
  const locationText = el("sellerLocation")?.value.trim();
  const description = el("sellerDescription")?.value.trim();
  if (!name || !owner || !locationText || !description) return;
  let slug = slugBase(name);
  let suffix = 2;
  while (appState.shops.some(s => s.slug === slug)) slug = slugBase(name) + "-" + suffix++;
  const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  const { data, error } = await db.from("shops").insert({
    owner_id: authUser.id,
    name,
    slug,
    owner_name: owner,
    owner_email: authUser.email,
    location: locationText,
    description,
    initials,
    status: "pending",
    banner_url: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1800&q=82"
  }).select("*").single();
  if (error) return fail("Shop application could not be saved", error);
  await refreshDatabaseState();
  window.closeModal?.();
  const shop = appState.shops.find(s => s.dbId === data.id);
  if (shop) window.rugvayaCurrentSellerShopId = shop.id;
  location.hash = "#seller-dashboard";
  window.renderRugvayaSellerDashboard?.();
  window.toast?.("Shop application saved to the Rugvaya database.");
};

async function openSellerWorkspaceForCurrentUser() {
  if (!authUser) return window.openCustomerLogin();
  let own = appState.shops.find(s => s.ownerId === authUser.id);
  if (!own) {
    window.showModal("No seller shop yet",
      '<p class="muted-note">Your account does not have a shop application yet.</p><button class="btn" onclick="closeModal();openSellerRegistration()">Apply to open a shop</button>');
    return;
  }
  window.rugvayaCurrentSellerShopId = own.id;
  window.renderRugvayaSellerDashboard?.();
}
window.openSellerDashboardLogin = () => {
  if (!authUser) {
    afterSignIn = () => openSellerWorkspaceForCurrentUser();
    return showAuthForm("signin");
  }
  openSellerWorkspaceForCurrentUser();
};
window.sellerDashboardLogin = event => {
  event?.preventDefault?.();
  openSellerWorkspaceForCurrentUser();
};
window.sellerSignOut = signOutRugvaya;

window.saveSellerShopProfile = async event => {
  event.preventDefault();
  const shop = currentShop();
  if (!authUser || !shop || shop.ownerId !== authUser.id) {
    window.toast?.("You can only edit a shop owned by your account.");
    return;
  }
  const name = el("editSellerShopName")?.value.trim();
  const locationText = el("editSellerShopLocation")?.value.trim();
  const description = el("editSellerShopDescription")?.value.trim();
  if (!name || !locationText || !description) return;
  let slug = slugBase(name);
  let suffix = 2;
  while (appState.shops.some(s => s.slug === slug && s.id !== shop.id)) slug = slugBase(name) + "-" + suffix++;
  const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  const { error } = await db.from("shops").update({
    name, slug, location: locationText, description, initials
  }).eq("id", shop.dbId);
  if (error) return fail("Shop profile update failed", error);
  await refreshDatabaseState({ render: false });
  window.closeModal?.();
  window.renderRugvayaSellerDashboard?.();
  window.toast?.("Shop profile updated in Supabase.");
};

window.reviewRugvayaShop = async (shopId, status) => {
  if (!isAdmin()) return window.toast?.("Only a Rugvaya admin can review seller applications.");
  if (!["approved", "rejected", "suspended"].includes(status)) return;
  const shop = shopByStorefrontId(shopId);
  if (!shop) return;
  const { error } = await db.from("shops").update({
    status,
    reviewed_at: new Date().toISOString(),
    reviewed_by: authUser.id
  }).eq("id", shop.dbId);
  if (error) return fail("Shop approval update failed", error);
  await refreshDatabaseState({ render: false });
  window.renderRugvayaAdminShops?.();
  window.toast?.(shop.name + " is now " + status + ".");
};

async function uploadProductImage(imageValue, shop) {
  if (!String(imageValue).startsWith("data:")) return imageValue;
  if (!shop?.dbId) throw new Error("Select a valid shop before uploading product images.");
  const response = await fetch(imageValue);
  const blob = await response.blob();
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const fileName = shop.dbId + "/" + Date.now() + "-" +
    (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)) + "." + ext;
  const { error } = await db.storage.from("rugvaya-product-images").upload(fileName, blob, {
    contentType: blob.type || "image/jpeg",
    upsert: false
  });
  if (error) throw error;
  return db.storage.from("rugvaya-product-images").getPublicUrl(fileName).data.publicUrl;
}

window.saveProduct = async (event, storefrontId) => {
  event.preventDefault();
  if (!authUser) return window.openCustomerLogin();
  const existing = storefrontId ? productByStorefrontId(storefrontId) : null;
  if (storefrontId && !existing) return window.toast?.("Product could not be found. Refresh and try again.");

  let shop = null;
  if (window.rugvayaCurrentSellerShopId) {
    shop = currentShop();
    if (!shop || shop.ownerId !== authUser.id || shop.status !== "approved") {
      return window.toast?.("An approved seller shop is required to manage products.");
    }
  } else {
    shop = shopByStorefrontId(el("editShopId")?.value || existing?.shopId);
    if (!shop || (!isAdmin() && shop.ownerId !== authUser.id)) {
      return window.toast?.("Choose a shop that your account is allowed to manage.");
    }
  }

  const tags = (el("editTags")?.value || "").split(",").map(x => x.trim()).filter(Boolean);
  const sizes = (el("editSizes")?.value || "").split(",").map(x => x.trim()).filter(Boolean);
  const pending = window.rugvayaGetPendingProductImages?.() || [];
  let imageValues = pending.length ? [...pending] : (existing?.images?.length ? [...existing.images] : [existing?.image].filter(Boolean));
  if (!imageValues.length) return window.toast?.("Upload at least one product photo.");
  const coverIndex = window.rugvayaGetPendingProductCoverIndex?.() || 0;
  try {
    const uploaded = [];
    for (const imageValue of imageValues) uploaded.push(await uploadProductImage(imageValue, shop));
    const cover = uploaded[coverIndex] || existing?.image || uploaded[0];
    const payload = {
      shop_id: shop.dbId,
      name: el("editName").value.trim(),
      category: el("editCategory").value,
      price: Number(el("editPrice").value),
      currency: "USD",
      stock: Number(el("editStock").value),
      size: sizes[0] || "",
      sizes,
      style: el("editStyle").value.trim(),
      material: el("editMaterial").value.trim(),
      color: el("editColor").value.trim(),
      technique: el("editTechnique").value.trim(),
      origin: el("editOrigin").value.trim(),
      tags,
      tag: tags[0] || "Rug",
      description: el("editDescription").value.trim(),
      long_description: el("editLongDescription").value.trim(),
      care_instructions: el("editCare").value.trim(),
      status: el("editStatus").value === "Published" ? "published" : "draft",
      cover_image_url: cover,
      image_urls: uploaded,
      photo_note: existing?.photoNote || "",
      image_credit: existing?.imageCredit || "",
      image_credit_url: existing?.imageCreditUrl || "",
      reference_source: existing?.referenceSource || "",
      reference_url: existing?.referenceUrl || "",
      price_note: existing?.priceNote || ""
    };
    if (!payload.name || !Number.isFinite(payload.price) || payload.price < 0 ||
        !Number.isInteger(payload.stock) || payload.stock < 0) {
      return window.toast?.("Check the product name, price and stock quantity.");
    }
    let result;
    if (existing) {
      result = await db.from("products").update(payload).eq("id", existing.dbId).select("*").single();
    } else {
      result = await db.from("products").insert(payload).select("*").single();
    }
    if (result.error) throw result.error;
    await refreshDatabaseState({ render: false });
    window.closeModal?.();
    if (window.rugvayaCurrentSellerShopId) {
      window.renderRugvayaSellerDashboard?.();
    } else {
      window.renderAdminProducts?.(el("adminMain"));
    }
    window.renderProducts?.();
    window.toast?.(existing ? "Product updated in Supabase." : "New product saved to Supabase.");
  } catch (error) {
    fail("Product save failed", error);
  }
};

window.updateProductStock = async storefrontId => {
  const product = productByStorefrontId(storefrontId);
  const input = el("stockEdit" + storefrontId);
  if (!product || !input || !authUser) return;
  const stock = Number(input.value);
  if (!Number.isInteger(stock) || stock < 0) return window.toast?.("Enter a whole stock quantity of zero or more.");
  const { error } = await db.from("products").update({ stock }).eq("id", product.dbId);
  if (error) return fail("Stock update failed", error);
  await refreshDatabaseState({ render: false });
  window.renderAdminProducts?.(el("adminMain"));
  window.renderProducts?.();
  window.toast?.("Stock updated in the Rugvaya database.");
};

window.deleteProduct = async storefrontId => {
  const product = productByStorefrontId(storefrontId);
  if (!product || !authUser) return;
  if (!confirm('Delete "' + product.name + '" from the Rugvaya catalogue?')) return;
  const { error } = await db.from("products").delete().eq("id", product.dbId);
  if (error) return fail("Product delete failed", error);
  await refreshDatabaseState({ render: false });
  window.renderAdminProducts?.(el("adminMain"));
  window.renderProducts?.();
  window.toast?.("Product deleted from Supabase.");
};

async function setCartQuantity(product, quantity) {
  if (!authUser) return;
  if (quantity <= 0) {
    const { error } = await db.from("cart_items").delete()
      .eq("user_id", authUser.id).eq("product_id", product.dbId);
    if (error) throw error;
  } else {
    const { error } = await db.from("cart_items").upsert({
      user_id: authUser.id, product_id: product.dbId, quantity
    }, { onConflict: "user_id,product_id" });
    if (error) throw error;
  }
  await refreshDatabaseState({ render: false });
  window.updateHeaderCounts?.();
}

window.addToCart = async (storefrontId, quantity = 1) => {
  const product = productByStorefrontId(storefrontId);
  if (!product || !window.isCustomerProductAvailable(product)) return window.toast?.("This rug is not currently available.");
  if (!requireAuth(() => window.addToCart(storefrontId, quantity), "Sign in to save your shopping bag across devices.")) return;
  const existing = appState.cart.find(item => String(item.productId) === String(storefrontId));
  try {
    await setCartQuantity(product, Math.min(10, (existing?.qty || 0) + quantity));
    window.toast?.("Added to your database-backed shopping bag.");
  } catch (error) { fail("Could not update your shopping bag", error); }
};

window.updateCartQty = async (storefrontId, delta) => {
  const product = productByStorefrontId(storefrontId);
  const item = appState.cart.find(row => String(row.productId) === String(storefrontId));
  if (!product || !item) return;
  try {
    await setCartQuantity(product, Math.max(0, Math.min(10, item.qty + delta)));
    window.renderCartModal?.();
  } catch (error) { fail("Cart update failed", error); }
};

window.removeCartItem = async storefrontId => {
  const product = productByStorefrontId(storefrontId);
  if (!product || !authUser) return;
  try {
    await setCartQuantity(product, 0);
    window.renderCartModal?.();
  } catch (error) { fail("Could not remove cart item", error); }
};

window.toggleWish = async (storefrontId, event) => {
  event?.stopPropagation?.();
  const product = productByStorefrontId(storefrontId);
  if (!product || !window.isCustomerProductAvailable(product)) return window.toast?.("This rug is not currently available.");
  if (!requireAuth(() => window.toggleWish(storefrontId), "Sign in to sync your wishlist across devices.")) return;
  const inList = appState.wishlist.includes(Number(storefrontId));
  const query = db.from("wishlist_items");
  const result = inList
    ? await query.delete().eq("user_id", authUser.id).eq("product_id", product.dbId)
    : await query.insert({ user_id: authUser.id, product_id: product.dbId });
  if (result.error) return fail("Wishlist update failed", result.error);
  await refreshDatabaseState({ render: false });
  window.renderProducts?.();
  if (el("modalContent")?.textContent.includes("wishlist")) window.renderWishlistModal?.();
};

window.openCart = () => {
  if (!authUser) {
    afterSignIn = () => window.openCart();
    return showAuthForm("signin");
  }
  window.renderCartModal?.();
};

window.openCheckout = () => {
  if (!authUser) {
    afterSignIn = () => window.openCheckout();
    return showAuthForm("signin");
  }
  if (!appState.cart.length) return window.toast?.("Your shopping bag is empty.");
  const total = appState.cart.reduce((sum, item) => {
    const p = productByStorefrontId(item.productId);
    return sum + (p ? p.price * item.qty : 0);
  }, 0);
  const fullName = authProfile?.full_name || authUser.user_metadata?.full_name || "";
  window.showModal("Checkout",
    '<div class="notice"><b>Order recording is live; payment collection is not connected yet.</b> This form saves the order and inventory in Supabase. It does not charge a card.</div>' +
    '<form onsubmit="placeDemoOrder(event)">' +
    '<h3 style="font:20px var(--serif);font-weight:400;margin:5px 0 15px">Contact information</h3>' +
    '<div class="admin-form-grid">' +
    '<div class="field"><label>Full name</label><input id="checkoutName" autocomplete="name" required value="' + window.escapeHtml(fullName) + '"></div>' +
    '<div class="field"><label>Account email</label><input type="email" disabled value="' + window.escapeHtml(authUser.email || "") + '"></div>' +
    '<div class="field full"><label>Phone number</label><input id="checkoutPhone" type="tel" autocomplete="tel" required placeholder="+1 555 123 4567"></div>' +
    '</div><h3 style="font:20px var(--serif);font-weight:400;margin:12px 0 15px">Shipping address</h3>' +
    '<div class="admin-form-grid">' +
    '<div class="field full"><label>Address line 1</label><input id="checkoutAddress1" autocomplete="address-line1" required></div>' +
    '<div class="field full"><label>Address line 2 (optional)</label><input id="checkoutAddress2" autocomplete="address-line2"></div>' +
    '<div class="field"><label>City</label><input id="checkoutCity" autocomplete="address-level2" required></div>' +
    '<div class="field"><label>State / Province</label><input id="checkoutState" autocomplete="address-level1" required></div>' +
    '<div class="field"><label>ZIP / Postal code</label><input id="checkoutPostal" autocomplete="postal-code" required></div>' +
    '<div class="field"><label>Country</label><select id="checkoutCountry" autocomplete="country-name" required><option value="United States" selected>United States</option><option value="Canada">Canada</option><option value="United Kingdom">United Kingdom</option><option value="Australia">Australia</option><option value="India">India</option><option value="Other">Other</option></select></div>' +
    '</div><div class="subtotal"><span>Order subtotal (USD)</span><b>' + window.money(total) + '</b></div>' +
    '<button class="btn" type="submit" style="width:100%">Place order →</button></form>');
};

window.placeDemoOrder = async event => {
  event.preventDefault();
  if (!authUser) return window.openCustomerLogin();
  const items = appState.cart.map(item => {
    const product = productByStorefrontId(item.productId);
    return product ? { product_id: product.dbId, quantity: item.qty } : null;
  }).filter(Boolean);
  if (!items.length) return window.toast?.("Your shopping bag is empty.");
  const shipping = {
    line1: el("checkoutAddress1")?.value.trim(),
    line2: el("checkoutAddress2")?.value.trim(),
    city: el("checkoutCity")?.value.trim(),
    state: el("checkoutState")?.value.trim(),
    postalCode: el("checkoutPostal")?.value.trim(),
    country: el("checkoutCountry")?.value
  };
  const { data, error } = await db.rpc("create_rugvaya_order", {
    p_customer_name: el("checkoutName")?.value.trim(),
    p_customer_phone: el("checkoutPhone")?.value.trim(),
    p_shipping_address: shipping,
    p_items: items
  });
  if (error) return fail("Order could not be placed", error);
  const clearCart = await db.from("cart_items").delete().eq("user_id", authUser.id);
  if (clearCart.error) console.warn("[Rugvaya] Order saved but cart cleanup failed:", clearCart.error);
  await refreshDatabaseState({ render: false });
  window.closeModal?.();
  window.toast?.("Order " + data.order_number + " saved. Payment is still pending.");
  window.showModal?.("Order received",
    '<p class="muted-note">Your order <b>' + window.escapeHtml(data.order_number) + '</b> has been recorded in Rugvaya. Payment has not been collected yet.</p>' +
    '<p><b>Total: ' + window.money(data.total) + ' USD</b></p><button class="btn" onclick="closeModal()">Continue shopping</button>');
};

window.subscribe = async event => {
  event.preventDefault();
  const email = el("newsletterEmail")?.value.trim().toLowerCase();
  if (!email) return;
  const { error } = await db.rpc("subscribe_to_rugvaya_newsletter", { p_email: email });
  if (error) return fail("Newsletter subscription failed", error);
  el("newsletterEmail").value = "";
  window.toast?.("Thanks for joining the Rugvaya list.");
};

window.updateOrderStatus = async (orderNumber, status) => {
  if (!isAdmin()) return window.toast?.("Only an administrator can update order status.");
  const order = appState.orders.find(o => o.id === orderNumber);
  if (!order) return;
  const { error } = await db.from("orders").update({ status: statusToDb(status) }).eq("id", order.dbId);
  if (error) return fail("Order status update failed", error);
  await refreshDatabaseState({ render: false });
  window.renderAdminOrders?.(el("adminMain"));
  window.toast?.("Order status saved to Supabase.");
};

window.saveTracking = async (event, orderNumber) => {
  event.preventDefault();
  if (!isAdmin()) return window.toast?.("Only an administrator can update tracking.");
  const order = appState.orders.find(o => o.id === orderNumber);
  if (!order) return;
  const tracking = el("trackingInput")?.value.trim() || "";
  const { error } = await db.from("orders").update({ tracking_number: tracking }).eq("id", order.dbId);
  if (error) return fail("Tracking update failed", error);
  await refreshDatabaseState({ render: false });
  window.closeModal?.();
  window.renderAdminOrders?.(el("adminMain"));
  window.toast?.("Tracking details saved to Supabase.");
};

window.getCustomerRecords = () => {
  const profiles = appState.customers || [];
  const map = new Map(profiles.map(p => [String(p.email || "").toLowerCase(), {
    name: p.full_name || "Customer", email: p.email, phone: "", shipping: null,
    orders: 0, spent: 0, orderHistory: []
  }]));
  (appState.orders || []).forEach(order => {
    const email = String(order.email || "").toLowerCase();
    if (!email) return;
    const record = map.get(email) || {
      name: order.name || "Customer", email, phone: "", shipping: null,
      orders: 0, spent: 0, orderHistory: []
    };
    record.name = order.name || record.name;
    record.phone = order.phone || record.phone;
    record.shipping = order.shipping || record.shipping;
    record.orderHistory.push(order);
    record.orders = record.orderHistory.length;
    record.spent = record.orderHistory.reduce((sum, item) => sum + Number(item.total || 0), 0);
    map.set(email, record);
  });
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
};

window.saveSeo = async event => {
  event.preventDefault();
  if (!isAdmin()) return window.toast?.("Only an administrator can edit store SEO settings.");
  const values = {
    id: true,
    seo_title: el("seoTitle")?.value.trim() || "",
    seo_description: el("seoDescription")?.value.trim() || "",
    seo_tagline: el("seoTagline")?.value.trim() || ""
  };
  const { error } = await db.from("store_settings").upsert(values, { onConflict: "id" });
  if (error) return fail("SEO settings update failed", error);
  appState.seoTitle = values.seo_title;
  appState.seoDescription = values.seo_description;
  appState.seoTagline = values.seo_tagline;
  window.toast?.("SEO settings saved to Supabase.");
};

window.renderAdminSettings = element => {
  if (!isAdmin()) return;
  element.innerHTML = '<div class="admin-heading"><div><div class="eyebrow">DATABASE & ACCOUNT</div><h1>Store settings</h1><p>Rugvaya production configuration.</p></div></div>' +
    '<div class="table-panel"><div class="notice"><b>Supabase connected.</b> Catalogue, shop applications, cart, wishlist, newsletter subscriptions, orders and SEO forms save to the shared database. Browser localStorage persistence has been removed.</div>' +
    '<div class="notice"><b>One-time migration:</b> import earlier browser-only edits, then remove the old browser copy. Demo checkouts are intentionally skipped.</div><button class="btn btn-small" onclick="importLegacyBrowserData()">Import previous browser data</button>' +
    '<table class="data-table"><tbody><tr><td><b>Store</b></td><td>Rugvaya</td></tr><tr><td><b>Database</b></td><td>Supabase PostgreSQL</td></tr><tr><td><b>Signed-in account</b></td><td>' + window.escapeHtml(authUser?.email || "") + '</td></tr><tr><td><b>Role</b></td><td>' + window.escapeHtml(authProfile?.role || "") + '</td></tr><tr><td><b>Product images</b></td><td>Supabase Storage</td></tr><tr><td><b>Payments</b></td><td>Not connected yet; orders are recorded as unpaid</td></tr></tbody></table></div>';
};


window.importLegacyBrowserData = async () => {
  if (!isAdmin()) return window.toast?.("Only a Rugvaya admin can import earlier browser data.");
  let raw;
  try { raw = localStorage.getItem("heritageRugsDemo"); }
  catch (error) { return fail("Could not access earlier browser data", error); }
  if (!raw) return window.toast?.("No earlier Rugvaya browser data was found on this device.");

  let legacy;
  try { legacy = JSON.parse(raw); }
  catch (error) { return fail("Earlier browser data is unreadable; the local copy was not deleted", error); }

  const summary = { shops: 0, products: 0, cart: 0, wishlist: 0, subscribers: 0, skippedOrders: Array.isArray(legacy.orders) ? legacy.orders.length : 0 };
  try {
    await refreshDatabaseState({ render: false });
    const legacyShopMap = new Map();
    const oldShops = Array.isArray(legacy.shops) ? legacy.shops : [];
    for (const oldShop of oldShops) {
      const already = appState.shops.find(shop =>
        String(shop.id) === String(oldShop.id) ||
        (shop.slug && shop.slug === oldShop.slug)
      );
      if (already) {
        legacyShopMap.set(String(oldShop.id), already);
        continue;
      }
      if (String(oldShop.ownerEmail || "").toLowerCase() !== String(authUser.email || "").toLowerCase()) continue;
      const payload = {
        owner_id: authUser.id,
        name: String(oldShop.name || "My Rug Shop").slice(0, 80),
        slug: slugBase(oldShop.slug || oldShop.name),
        owner_name: String(oldShop.ownerName || authProfile?.full_name || authUser.email).slice(0, 100),
        owner_email: authUser.email,
        location: String(oldShop.location || "Location to be confirmed").slice(0, 160),
        description: String(oldShop.description || "").slice(0, 1200),
        initials: String(oldShop.initials || "RS").slice(0, 5),
        status: "pending",
        banner_url: oldShop.banner || null
      };
      let suffix = 2;
      const base = payload.slug;
      while (appState.shops.some(shop => shop.slug === payload.slug)) payload.slug = base + "-" + suffix++;
      const inserted = await db.from("shops").insert(payload).select("*").single();
      if (inserted.error) throw inserted.error;
      const mapped = mapShop(inserted.data);
      appState.shops.push(mapped);
      legacyShopMap.set(String(oldShop.id), mapped);
      summary.shops++;
    }

    const oldProducts = Array.isArray(legacy.products) ? legacy.products : [];
    for (const oldProduct of oldProducts) {
      const shop = legacyShopMap.get(String(oldProduct.shopId)) ||
        shopByStorefrontId(oldProduct.shopId) ||
        (!oldProduct.shopId ? appState.shops.find(item => item.ownerId === authUser.id) : null);
      if (!shop) continue;

      const oldImages = Array.isArray(oldProduct.images) && oldProduct.images.length
        ? oldProduct.images
        : [oldProduct.image].filter(Boolean);
      if (!oldImages.length) continue;
      const imageUrls = [];
      for (const imageValue of oldImages) imageUrls.push(await uploadProductImage(imageValue, shop));

      const tags = Array.isArray(oldProduct.tags) ? oldProduct.tags : (oldProduct.tag ? [oldProduct.tag] : []);
      const sizes = Array.isArray(oldProduct.sizes) ? oldProduct.sizes : (oldProduct.size ? [oldProduct.size] : []);
      const payload = {
        shop_id: shop.dbId,
        name: String(oldProduct.name || "Rug listing").slice(0, 180),
        category: String(oldProduct.category || "Traditional"),
        price: Math.max(0, Number(oldProduct.price || 0)),
        currency: "USD",
        stock: Math.max(0, Math.floor(Number(oldProduct.stock || 0))),
        size: String(oldProduct.size || sizes[0] || ""),
        sizes,
        style: String(oldProduct.style || ""),
        material: String(oldProduct.material || ""),
        color: String(oldProduct.color || ""),
        technique: String(oldProduct.technique || ""),
        origin: String(oldProduct.origin || ""),
        tags,
        tag: String(oldProduct.tag || tags[0] || "Rug"),
        description: String(oldProduct.description || ""),
        long_description: String(oldProduct.longDescription || ""),
        care_instructions: String(oldProduct.careInstructions || ""),
        cover_image_url: imageUrls[0],
        image_urls: imageUrls,
        photo_note: String(oldProduct.photoNote || ""),
        image_credit: String(oldProduct.imageCredit || ""),
        image_credit_url: String(oldProduct.imageCreditUrl || ""),
        reference_source: String(oldProduct.referenceSource || ""),
        reference_url: String(oldProduct.referenceUrl || ""),
        price_note: String(oldProduct.priceNote || ""),
        status: "draft"
      };
      let existing = appState.products.find(product =>
        (Number.isFinite(Number(oldProduct.id)) && product.id === Number(oldProduct.id)) ||
        (product.name === payload.name && String(product.shopId) === String(shop.id))
      );
      let saved;
      if (existing) {
        saved = await db.from("products").update(payload).eq("id", existing.dbId).select("*").single();
      } else {
        saved = await db.from("products").insert(payload).select("*").single();
      }
      if (saved.error) throw saved.error;
      summary.products++;
    }

    for (const oldItem of (Array.isArray(legacy.cart) ? legacy.cart : [])) {
      const product = productByStorefrontId(oldItem.productId);
      if (!product) continue;
      const quantity = Math.max(1, Math.min(10, Math.floor(Number(oldItem.qty || 1))));
      const saved = await db.from("cart_items").upsert({
        user_id: authUser.id, product_id: product.dbId, quantity
      }, { onConflict: "user_id,product_id" });
      if (saved.error) throw saved.error;
      summary.cart++;
    }
    for (const oldId of (Array.isArray(legacy.wishlist) ? legacy.wishlist : [])) {
      const product = productByStorefrontId(oldId);
      if (!product) continue;
      const saved = await db.from("wishlist_items").upsert({
        user_id: authUser.id, product_id: product.dbId
      }, { onConflict: "user_id,product_id" });
      if (saved.error) throw saved.error;
      summary.wishlist++;
    }
    for (const oldEmail of (Array.isArray(legacy.subscribers) ? legacy.subscribers : [])) {
      const saved = await db.rpc("subscribe_to_rugvaya_newsletter", { p_email: String(oldEmail) });
      if (saved.error) throw saved.error;
      summary.subscribers++;
    }
    if (legacy.seoTitle || legacy.seoDescription || legacy.seoTagline) {
      const saved = await db.from("store_settings").upsert({
        id: true,
        seo_title: String(legacy.seoTitle || appState.seoTitle || ""),
        seo_description: String(legacy.seoDescription || appState.seoDescription || ""),
        seo_tagline: String(legacy.seoTagline || appState.seoTagline || "")
      }, { onConflict: "id" });
      if (saved.error) throw saved.error;
    }

    // Prior browser checkouts were explicitly marked as demo and had no payment.
    // They are intentionally not converted into real orders or customer records.
    localStorage.removeItem("heritageRugsDemo");
    await refreshDatabaseState({ render: false });
    window.renderProducts?.();
    window.renderAdminProducts?.(el("adminMain"));
    window.showModal?.("Earlier browser data imported",
      '<p class="muted-note">Imported into Supabase:</p><ul>' +
      '<li>Shop applications: ' + summary.shops + '</li>' +
      '<li>Product records: ' + summary.products + ' (saved as drafts for admin review)</li>' +
      '<li>Cart items: ' + summary.cart + '</li>' +
      '<li>Wishlist items: ' + summary.wishlist + '</li>' +
      '<li>Newsletter addresses: ' + summary.subscribers + '</li></ul>' +
      '<p class="muted-note">The old browser copy was removed. ' + summary.skippedOrders +
      ' old demo order records were not imported because they were unpaid prototype checkouts, not verified purchases.</p>' +
      '<button class="btn" onclick="closeModal()">Done</button>');
  } catch (error) {
    fail("Legacy import stopped; the old browser copy was kept so it can be retried", error);
  }
};

window.resetDemo = () => window.toast?.("Demo reset was removed. Manage real catalogue records in Supabase.");
window.exportData = () => {
  if (!isAdmin()) return;
  const blob = new Blob([JSON.stringify({
    products: appState.products, shops: appState.shops, orders: appState.orders,
    sellerApplications: appState.sellerApplications
  }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "rugvaya-database-export.json";
  anchor.click();
  URL.revokeObjectURL(url);
};

const baseAdminTab = window.adminTab;
window.adminTab = async (tab, button) => {
  if (!isAdmin()) return window.toast?.("Sign in with the Rugvaya admin account to open this workspace.");
  try {
    await refreshDatabaseState({ render: false });
    if (tab === "shops") {
      document.querySelectorAll(".admin-nav[data-tab]").forEach(node => node.classList.toggle("active", node.dataset.tab === "shops"));
      window.renderRugvayaAdminShops?.();
      return;
    }
    if (typeof baseAdminTab === "function") return baseAdminTab(tab, button);
  } catch (error) {
    fail("Admin data could not be loaded", error);
  }
};

async function initSupabaseStore() {
  if (!db || !appState) {
    console.error("[Rugvaya] Supabase application could not start: client/state missing.");
    return;
  }
  try {
    await window.rugvayaSupabaseReady;
    const { data, error } = await db.auth.getSession();
    if (error) throw error;
    await applySession(data.session, true);
    db.auth.onAuthStateChange((_event, session) => {
      Promise.resolve().then(() => applySession(session, true));
    });
    console.info("[Rugvaya] Database-backed storefront ready.");
  } catch (error) {
    fail("Rugvaya database startup failed", error);
  }
}

initSupabaseStore();
