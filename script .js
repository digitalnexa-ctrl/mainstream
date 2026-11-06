document.addEventListener("DOMContentLoaded", () => {

  /* =========================
     MAINSTREAM PRODUCTS
  ========================= */

  const products = [
    {
      id: 1,
      name: "MAX / 03 TEE",
      price: 899,
      image: "product-1.jpg",
      category: "T-SHIRTS"
    },
    {
      id: 2,
      name: "LEWIS / 44 TEE",
      price: 899,
      image: "product-2.jpg",
      category: "T-SHIRTS"
    },
    {
      id: 3,
      name: "CHARLES / 16 TEE",
      price: 899,
      image: "product-3.jpg",
      category: "T-SHIRTS"
    },
    {
      id: 4,
      name: "LANDO / 01 TEE",
      price: 899,
      image: "product-4.jpg",
      category: "T-SHIRTS"
    },
    {
      id: 5,
      name: "OSCAR / 81 TEE",
      price: 899,
      image: "product-5.jpg",
      category: "T-SHIRTS"
    }
  ];


  /* =========================
     CART
  ========================= */

  let cart = JSON.parse(localStorage.getItem("mainstreamCart")) || [];


  function saveCart() {
    localStorage.setItem("mainstreamCart", JSON.stringify(cart));
    updateCartCount();
  }


  function updateCartCount() {

    const count = cart.reduce(
      (total, item) => total + Number(item.quantity || 0),
      0
    );

    document.querySelectorAll("#cartCount, .cart-count").forEach(element => {
      element.textContent = count;
    });
  }


  /* =========================
     RENDER PRODUCTS
  ========================= */

  function renderProducts(list = products) {

    const container = document.getElementById("products");

    if (!container) return;

    container.innerHTML = "";

    if (list.length === 0) {

      container.innerHTML = `
        <div style="
          grid-column:1/-1;
          text-align:center;
          padding:80px 20px;
          font-size:18px;
          letter-spacing:2px;
        ">
          NO PRODUCTS FOUND
        </div>
      `;

      return;
    }


    list.forEach(product => {

      const card = document.createElement("article");

      card.className = "product";

      card.innerHTML = `

        <div class="product-image">

          <img
            src="${product.image}"
            alt="${product.name}"
            loading="lazy"
          >

        </div>

        <div class="product-info">

          <h3>${product.name}</h3>

          <strong>₹${product.price}</strong>

          <p>${product.category}</p>

          <div class="product-actions">

            <button
              class="view-product"
              onclick="viewProduct(${product.id})"
            >
              VIEW PRODUCT
            </button>

            <button
              class="add"
              onclick="addToCart(${product.id})"
            >
              ADD TO CART
            </button>

          </div>

        </div>
      `;

      container.appendChild(card);

    });

  }


  /* =========================
     ADD TO CART
  ========================= */

  window.addToCart = function(id) {

    const product = products.find(item => item.id === id);

    if (!product) return;


    const existing = cart.find(item => item.id === id);


    if (existing) {

      existing.quantity += 1;

    } else {

      cart.push({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        quantity: 1
      });

    }


    saveCart();


    const button = document.querySelector(
      `.product .add[onclick="addToCart(${id})"]`
    );


    if (button) {

      const originalText = button.textContent;

      button.textContent = "✓ ADDED";

      setTimeout(() => {
        button.textContent = originalText;
      }, 1200);

    }

  };


  /* =========================
     VIEW PRODUCT
  ========================= */

  window.viewProduct = function(id) {

    const product = products.find(item => item.id === id);

    if (!product) return;

    localStorage.setItem(
      "selectedProduct",
      JSON.stringify(product)
    );

    window.location.href = "product.html";

  };


  /* =========================
     OPEN CART
  ========================= */

  window.openCart = function() {

    const cartBox = document.getElementById("cart");
    const overlay = document.getElementById("overlay");

    if (cartBox) {
      cartBox.classList.add("open");
    }

    if (overlay) {
      overlay.classList.add("show");
    }

    renderCart();

  };


  /* =========================
     CLOSE CART
  ========================= */

  window.closeCart = function() {

    const cartBox = document.getElementById("cart");
    const overlay = document.getElementById("overlay");

    if (cartBox) {
      cartBox.classList.remove("open");
    }

    if (overlay) {
      overlay.classList.remove("show");
    }

  };


  /* =========================
     RENDER CART
  ========================= */

  function renderCart() {

    const container = document.getElementById("cartItems");

    const totalElement = document.getElementById("cartTotal");

    if (!container) return;


    container.innerHTML = "";


    if (cart.length === 0) {

      container.innerHTML = `
        <p style="
          padding:30px 0;
          text-align:center;
          letter-spacing:1px;
        ">
          YOUR CART IS EMPTY
        </p>
      `;

      if (totalElement) {
        totalElement.textContent = "₹0";
      }

      return;

    }


    let total = 0;


    cart.forEach(item => {

      const quantity = Number(item.quantity || 1);

      const price = Number(item.price || 0);

      total += price * quantity;


      const itemElement = document.createElement("div");

      itemElement.className = "cart-item";


      itemElement.innerHTML = `

        <img
          src="${item.image}"
          alt="${item.name}"
        >

        <div>

          <strong>${item.name}</strong>

          <p>₹${price}</p>

          <div class="quantity-controls">

            <button onclick="changeQuantity(${item.id}, -1)">
              −
            </button>

            <span>${quantity}</span>

            <button onclick="changeQuantity(${item.id}, 1)">
              +
            </button>

          </div>

          <button
            class="remove-item"
            onclick="removeFromCart(${item.id})"
          >
            REMOVE
          </button>

        </div>
      `;


      container.appendChild(itemElement);

    });


    if (totalElement) {
      totalElement.textContent =
        "₹" + total.toLocaleString("en-IN");
    }

  }


  /* =========================
     CHANGE QUANTITY
  ========================= */

  window.changeQuantity = function(id, change) {

    const item = cart.find(product => product.id === id);

    if (!item) return;


    item.quantity += change;


    if (item.quantity <= 0) {

      cart = cart.filter(product => product.id !== id);

    }


    saveCart();

    renderCart();

  };


  /* =========================
     REMOVE FROM CART
  ========================= */

  window.removeFromCart = function(id) {

    cart = cart.filter(item => item.id !== id);

    saveCart();

    renderCart();

  };


  /* =========================
     CHECKOUT
  ========================= */

  window.checkout = function() {

    if (cart.length === 0) {

      alert("Your cart is empty.");

      return;

    }

    window.location.href = "shipping.html";

  };


  /* =========================
     SEARCH
  ========================= */

  window.searchProducts = function() {

    const searchTerm = prompt(
      "SEARCH MAINSTREAM PRODUCTS"
    );

    if (searchTerm === null) return;


    const term = searchTerm
      .trim()
      .toLowerCase();


    if (!term) {

      renderProducts(products);

      return;

    }


    const results = products.filter(product =>
      product.name.toLowerCase().includes(term) ||
      product.category.toLowerCase().includes(term)
    );


    renderProducts(results);

  };


  /* =========================
     INITIAL LOAD
  ========================= */

  renderProducts();

  updateCartCount();

});
