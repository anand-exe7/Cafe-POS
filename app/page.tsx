export default function Home() {
  return (
    <>
      {/* ===================== HERO PANEL ===================== */}
      <section className="hero">
        {/* decorative corner strawberries */}
        <img
          className="berry berry--tl"
          src="https://images.unsplash.com/photo-1464965911861-746a04b4bca6?auto=format&fit=crop&w=220&q=80"
          alt=""
        />
        <img
          className="berry berry--tr"
          src="https://images.unsplash.com/photo-1518635017498-87f514b751ba?auto=format&fit=crop&w=220&q=80"
          alt=""
        />

        {/* NAV */}
        <header className="nav">
          <nav className="nav__left">
            <a href="#">Home</a>
            <a href="#">Cakes</a>
            <a href="#">About Us</a>
          </nav>

          <a href="#" className="brand">
            <span className="brand__mark">JM</span>
            <span className="brand__name">CAKES</span>
          </a>

          <div className="nav__right">
            <a href="#" className="nav__contact">
              Contact Us
            </a>
            <a href="#" className="pill pill--phone">
              111-000-111
            </a>
          </div>
        </header>

        {/* vertical side label */}
        <span className="side-label">ANY TYPE OF CAKE YOU NEED</span>

        {/* hero copy */}
        <div className="hero__copy">
          <h1 className="hero__title">WELCOME TO JM CAKES</h1>
          <p className="hero__lead">
            JM Cake is a family-owned bakery established in 2015 in Hobart. Since
            day one, our goal has been simple: to craft beautiful, handmade cakes
            that make people smile.
          </p>
          <div className="hero__cta">
            <a href="#" className="pill pill--solid">
              Shop Now
            </a>
            <a href="#" className="pill pill--ghost">
              Explore More
            </a>
          </div>
        </div>

        {/* hero cake */}
        <div className="hero__cake">
          <img
            className="cake-img"
            src="https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=760&q=85"
            alt="Two tier chocolate cake"
          />
        </div>

        {/* tagline */}
        <p className="hero__tagline">FOR EVERY OCCASION DESIGNED JUST FOR YOU</p>
        <div className="hero__order">
          <a href="#" className="pill pill--ghost pill--wide">
            Order Now for Customized Cake
          </a>
        </div>
      </section>

      {/* ===================== CATEGORY STRIP ===================== */}
      <section className="cats">
        <a className="cat-card" href="#">
          <img
            src="https://images.unsplash.com/photo-1558636508-e0db3814bd1d?auto=format&fit=crop&w=360&q=80"
            alt=""
          />
          <span>Birthday Cakes</span>
        </a>
        <a className="cat-card" href="#">
          <img
            src="https://images.unsplash.com/photo-1535141192574-5d4897c12636?auto=format&fit=crop&w=360&q=80"
            alt=""
          />
          <span>Wedding Cakes</span>
        </a>
        <a className="cat-card" href="#">
          <img
            src="https://images.unsplash.com/photo-1481391319762-47dff72954d9?auto=format&fit=crop&w=360&q=80"
            alt=""
          />
          <span>Christmas Cakes</span>
        </a>
        <span className="cats__more">&rarr;</span>
      </section>

      {/* ===================== CELEBRATE LIFE ===================== */}
      <section className="celebrate">
        <div className="celebrate__head">
          <h2>
            CAKES THAT
            <br />
            CELEBRATE LIFE
          </h2>
          <span className="ribbon">🎂</span>
        </div>
        <div className="celebrate__grid">
          <figure className="celebrate__hero">
            <img
              src="https://images.unsplash.com/photo-1606890737304-57a1ca8a5b62?auto=format&fit=crop&w=560&q=85"
              alt="Decorated celebration cake"
            />
          </figure>
          <div className="celebrate__body">
            <p>
              We bake all our cakes and sweets fresh in-store daily, using only
              the finest ingredients. Whether you&apos;re passing it to a slice or
              planning a big celebration, we offer a cozy space for meetups,
              family time, or a well-deserved treat.
            </p>
            <p>
              At JM Cakes, every cake is more than just dessert — it&apos;s a
              centerpiece, a talking point, and sometimes even the surprise
              itself. Whether it&apos;s a birthday cake, a show-stopping wedding
              cake, or a thoughtful corporate treat, our cakes are made with love,
              care, and creativity. We proudly serve a wide range of dietary needs
              including vegan, gluten-free, and dairy-free.
            </p>
            <div className="thumbs">
              <img
                src="https://images.unsplash.com/photo-1519340241574-2cec6aef0c01?auto=format&fit=crop&w=200&q=80"
                alt=""
              />
              <img
                src="https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=200&q=80"
                alt=""
              />
              <img
                src="https://images.unsplash.com/photo-1587668178277-295251f900ce?auto=format&fit=crop&w=200&q=80"
                alt=""
              />
            </div>
          </div>
        </div>
      </section>

      {/* ===================== DREAM CAKE BANNER ===================== */}
      <section className="dream">
        <img
          className="dream__img"
          src="https://images.unsplash.com/photo-1621303837174-89787a7d4729?auto=format&fit=crop&w=420&q=80"
          alt=""
        />
        <div className="dream__copy">
          <h3>
            READY TO BRING YOUR
            <br />
            DREAM CAKE TO LIFE?
          </h3>
          <p>
            Tell us your idea and let our bakers turn it into something
            unforgettable, one custom creation at a time.
          </p>
          <a href="#" className="pill pill--solid">
            Get Started
          </a>
        </div>
        <img
          className="dream__img dream__img--r"
          src="https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=420&q=80"
          alt=""
        />
      </section>

      {/* ===================== DIETARY OPTIONS ===================== */}
      <section className="dietary">
        <h2 className="dietary__title">SPECIAL DIETARY OPTIONS</h2>
        <span className="pill pill--tab">All Tastes Buds Are Welcome</span>

        <div className="dietary__grid">
          <div className="tag-col">
            <span className="tag">
              Gluten Free
              <br />
              <small>Cakes Range</small>
            </span>
            <span className="tag">
              Sugar Free
              <br />
              <small>Cakes Range</small>
            </span>
          </div>

          <figure className="dietary__hero">
            <img
              src="https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=520&q=85"
              alt="Strawberry drip cake on a stand"
            />
          </figure>

          <div className="tag-col tag-col--r">
            <span className="tag">
              Vegan
              <br />
              <small>Cakes Range</small>
            </span>
            <span className="tag">
              Dairy Free
              <br />
              <small>Cakes Range</small>
            </span>
          </div>
        </div>
        <p className="dietary__note">
          We believe everyone deserves cake, no matter their diet. That&apos;s why
          we offer inclusive, delicious options. Every bite is just as delightful
          as our classic cakes.
        </p>
      </section>

      {/* ===================== GALLERY ROW ===================== */}
      <section className="gallery">
        <img
          src="https://images.unsplash.com/photo-1621303837174-89787a7d4729?auto=format&fit=crop&w=320&q=80"
          alt=""
        />
        <img
          src="https://images.unsplash.com/photo-1535141192574-5d4897c12636?auto=format&fit=crop&w=320&q=80"
          alt=""
        />
        <img
          src="https://images.unsplash.com/photo-1558636508-e0db3814bd1d?auto=format&fit=crop&w=320&q=80"
          alt=""
        />
        <img
          src="https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=320&q=80"
          alt=""
        />
        <img
          src="https://images.unsplash.com/photo-1519340241574-2cec6aef0c01?auto=format&fit=crop&w=320&q=80"
          alt=""
        />
      </section>

      {/* ===================== FOOTER ===================== */}
      <footer className="foot">
        <a href="#" className="brand brand--foot">
          <span className="brand__mark">JM</span>
          <span className="brand__name">CAKES</span>
        </a>
        <p>Handmade with love in Hobart since 2015.</p>
        <p className="foot__copy">© 2026 JM Cakes. All rights reserved.</p>
      </footer>
    </>
  );
}
