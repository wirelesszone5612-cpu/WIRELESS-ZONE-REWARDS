
const REWARDS = [
  { points: 50, value: 3 },
  { points: 100, value: 8 },
  { points: 200, value: 20 }
];

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
let selectedCustomer = null;
let allCustomers = [];

const $ = id => document.getElementById(id);
const esc = (s="") => String(s).replace(/[&<>"']/g, m => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
}[m]));

async function init(){
  const params = new URLSearchParams(window.location.search);
  const joinMode = params.get("join");
  const customerId = params.get("customer");

  if(joinMode === "1"){
    renderJoinPage();
    return;
  }

  if(customerId){
    await renderCustomerCard(customerId);
    return;
  }

  const { data: { session } } = await sb.auth.getSession();
  renderAuth(session);

  sb.auth.onAuthStateChange((_event, nextSession) => {
    renderAuth(nextSession);
  });
}

function renderJoinPage(){
  $("loginCard").hidden = true;
  $("app").hidden = false;
  $("authArea").innerHTML = "";
  const stats = $("app").querySelector(".stats");
if(stats) stats.style.display = "none";
  

  Array.from($("app").children).forEach(el => {
    el.hidden = true;
  });

  $("joinCard").hidden = false;
}
$("joinRewardsBtn").addEventListener("click", async () => {
  const name = $("joinName").value.trim();
  const phone = $("joinPhone").value.replace(/\D/g, "");
  const birthday = $("joinBirthday").value;

  if(!name || !phone || !birthday){
    $("joinMsg").textContent = "Please complete all fields.";
    return;
  }

  $("joinMsg").textContent = "Creating your rewards account...";

  const { data, error } = await sb.rpc("join_rewards", {
    customer_name: name,
    customer_phone: phone,
    customer_birthday: birthday
  });

  if(error){
    console.error(error);
    $("joinMsg").textContent = "Unable to sign up. Please ask a store associate.";
    return;
  }

  const customer = Array.isArray(data) ? data[0] : data;

  if(!customer?.id){
    $("joinMsg").textContent = "Unable to create rewards account.";
    return;
  }

  window.location.href =
    `${window.location.pathname}?customer=${customer.id}`;
}); 
async function renderCustomerCard(customerId){
  $("loginCard").hidden = true;
  $("app").hidden = false;
  $("authArea").innerHTML = "";

  Array.from($("app").children).forEach(el => {
    el.hidden = el.id !== "customerCard";
  });

  $("customerCard").hidden = false;

 const { data: customer, error } = await sb
  .rpc("get_customer_card", { customer_id: customerId })
  .single();
  if(error || !customer){
    $("customerCard").innerHTML = `
      <h2>Wireless Zone Rewards</h2>
      <p class="muted">Customer card not found.</p>
    `;
    return;
  }

  $("customerCardName").textContent = customer.name || "Customer";
  $("customerCardPoints").textContent = customer.points || 0;
  $("customerCardMemberId").textContent = `Member ID: ${customer.id}`;

  const reward = [...REWARDS]
    .reverse()
    .find(r => (customer.points || 0) >= r.points);

  $("customerCardReward").innerHTML = reward
    ? `<p><strong>$${reward.value} Reward Available</strong></p>`
    : `<p class="muted">Keep earning points toward your next reward.</p>`;

  QRCode.toCanvas(
    $("customerCardQr"),
   `${window.location.origin}${window.location.pathname}?customer=${customer.id}`,
    { width: 180, margin: 1 },
    err => {
      if(err) console.error(err);
    }
  );
}
async function renderAuth(session){
  $("loginCard").hidden = !!session;
  $("app").hidden = !session;
  $("authArea").innerHTML = session ? `<button class="ghost" id="logoutBtn">Logout</button>` : "";
  if(session){
    $("logoutBtn").onclick = () => sb.auth.signOut();
    await loadCustomers();
  } else {
    selectedCustomer = null;
    $("detailCard").hidden = true;
  }
}

$("loginBtn").onclick = async () => {
  $("loginMsg").textContent = "Signing in...";
  const { error } = await sb.auth.signInWithPassword({
    email: $("email").value.trim(),
    password: $("password").value
  });
  $("loginMsg").textContent = error ? error.message : "";
};

$("addCustomer").onclick = async () => {
  const name = $("name").value.trim();
  const phone = $("phone").value.trim();
  const birthday = $("birthday").value || null;
  if(!name || !phone) return alert("Name and phone are required.");

  const { error } = await sb.from("customers").insert({ name, phone, birthday });
  if(error) return alert(error.message);

  $("name").value = "";
  $("phone").value = "";
  $("birthday").value = "";
  await loadCustomers();
};

$("search").oninput = () => renderCustomerList();

async function loadCustomers(){
  const { data, error } = await sb
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false });

  if(error){
    $("customerList").innerHTML = `<p class="muted">${esc(error.message)}</p>`;
    return;
  }

  allCustomers = data || [];
  $("customerCount").textContent = allCustomers.length;
  renderCustomerList();
  renderBirthdays();
}

function renderCustomerList(){
  const q = $("search").value.toLowerCase().trim();
  const list = allCustomers.filter(c =>
    !q || c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q)
  );

  $("customerList").innerHTML = list.length ? list.map(c => `
    <div class="customer">
      <div>
        <strong>${esc(c.name)}</strong>
        <div class="muted">${esc(c.phone)}</div>
      </div>
      <div>
        <span class="badge">${c.points} pts</span>
        <button onclick="openCustomer('${c.id}')">Open</button>
      </div>
    </div>
  `).join("") : `<p class="muted">No customers found.</p>`;
}

window.openCustomer = async (id) => {
  const { data, error } = await sb.from("customers").select("*").eq("id", id).single();
  if(error) return alert(error.message);
  selectedCustomer = data;
  $("detailCard").hidden = false;
  await renderDetail();
  $("detailCard").scrollIntoView({ behavior:"smooth", block:"start" });
};

async function renderDetail(){
  const c = selectedCustomer;
  if(!c) return;

  $("detailName").textContent = c.name;
  $("detailPhone").textContent = c.phone + (c.birthday ? ` • Birthday: ${formatBirthday(c.birthday)}` : "");
  $("detailPoints").textContent = c.points;

  $("rewards").innerHTML = REWARDS.map(r => {
    const ok = c.points >= r.points;
    return `
      <div class="reward ${ok ? "" : "locked"}">
        <div><strong>${r.points} points</strong><div class="muted">$${r.value} reward</div></div>
        <button ${ok ? "" : "disabled"} onclick="redeem(${r.points},${r.value})">Redeem</button>
      </div>
    `;
  }).join("");


 const now = new Date();
const year = now.getFullYear();
const currentMonth = now.getMonth() + 1;
const birthdayMonth = c.birthday
  ? Number(String(c.birthday).split("-")[1])
  : null;

if(!c.birthday){
  $("birthdayStatus").innerHTML =
    `<p class="muted">No birthday saved.</p>`;
  $("claimBirthday").disabled = true;

} else if(c.birthday_gift_year === year){
  $("birthdayStatus").innerHTML =
    `<p><span class="badge">Gift claimed ${year}</span></p>`;
  $("claimBirthday").disabled = true;

} else if(birthdayMonth === currentMonth){
  $("birthdayStatus").innerHTML =
    `<p><span class="badge">Birthday gift available this month 🎉</span></p>`;
  $("claimBirthday").disabled = false;

} else {
  $("birthdayStatus").innerHTML =
    `<p class="muted">Birthday gift available during birthday month.</p>`;
  $("claimBirthday").disabled = true;
}
  
  const customerUrl = `${window.location.origin}${window.location.pathname}?customer=${c.id}`;

QRCode.toCanvas($("qrCanvas"), customerUrl, { width:220, margin:1 }, err => {
    if(err) console.error(err);
  });

  const { data: history, error } = await sb
    .from("transactions")
    .select("*")
    .eq("customer_id", c.id)
    .order("created_at", { ascending:false })
    .limit(100);

  if(error){
    $("history").innerHTML = `<p class="muted">${esc(error.message)}</p>`;
  } else {
    $("history").innerHTML = (history || []).length ? history.map(h => `
      <div class="historyRow">
        <span>${esc(h.description)}</span>
        <span class="muted">${new Date(h.created_at).toLocaleString()}</span>
      </div>
    `).join("") : `<p class="muted">No history yet.</p>`;
  }
}

$("addPurchase").onclick = async () => {
  if(!selectedCustomer) return;
  const amount = parseFloat($("purchaseAmount").value);
  if(!amount || amount <= 0) return alert("Enter a valid purchase amount.");

  const points = Math.floor(amount / 10);
  if(points <= 0) return alert("Purchase must be at least $10 to earn a point.");

  const { error } = await sb.rpc("add_purchase_points", {
    p_customer_id: selectedCustomer.id,
    p_amount: amount,
    p_points: points
  });

  if(error) return alert(error.message);
  $("purchaseAmount").value = "";
  await refreshSelected();
};

window.redeem = async (points, value) => {
  if(!selectedCustomer || selectedCustomer.points < points) return;
  if(!confirm(`Redeem ${points} points for a $${value} reward?`)) return;

  const { error } = await sb.rpc("redeem_reward", {
    p_customer_id: selectedCustomer.id,
    p_points: points,
    p_value: value
  });

  if(error) return alert(error.message);
  await refreshSelected();
};

$("claimBirthday").onclick = async () => {
  if(!selectedCustomer) return;
  const year = new Date().getFullYear();

  const { error } = await sb.rpc("claim_birthday_gift", {
    p_customer_id: selectedCustomer.id,
    p_year: year
  });

  if(error) return alert(error.message);
  await refreshSelected();
};

async function refreshSelected(){
  const { data, error } = await sb.from("customers").select("*").eq("id", selectedCustomer.id).single();
  if(error) return alert(error.message);
  selectedCustomer = data;
  await loadCustomers();
  await renderDetail();
}

function nextBirthday(dateStr){
  if(!dateStr) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let candidate = safeBirthdayDate(now.getFullYear(), month, day);
  if(candidate < today) candidate = safeBirthdayDate(now.getFullYear() + 1, month, day);
  return candidate;
}

function safeBirthdayDate(year, month, day){
  // Handles Feb 29 birthdays by using Feb 28 in non-leap years.
  let d = new Date(year, month - 1, day);
  if(d.getMonth() !== month - 1) d = new Date(year, month - 1, 28);
  return d;
}

function renderBirthdays(){
const now = new Date();
const currentMonth = now.getMonth();

const upcoming = allCustomers
  .filter(c => c.birthday)
  .map(c => {
    const parts = String(c.birthday).split("-");
    const month = Number(parts[1]);
    const day = Number(parts[2]);

    return {
      c,
      next: safeBirthdayDate(now.getFullYear(), month, day)
    };
  })
  .filter(x => x.next.getMonth() === currentMonth)
  .sort((a, b) => a.next - b.next);

  $("birthdayCount").textContent = upcoming.length;
  $("birthdays").innerHTML = upcoming.length ? upcoming.map(x => `
    <div class="birthdayRow">
      <span>
        <strong>${esc(x.c.name)}</strong>
        <div class="muted">${esc(x.c.phone)}</div>
      </span>
      <span>${x.next.toLocaleDateString()}</span>
    </div>
  `).join("") : `<p class="muted">No birthdays in the next 14 days.</p>`;
}

function formatBirthday(dateStr){
  const [y,m,d] = dateStr.split("-").map(Number);
  return new Date(y, m-1, d).toLocaleDateString();
}

init();
