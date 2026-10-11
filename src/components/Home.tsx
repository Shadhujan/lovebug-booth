
type Props = { onStart: () => void; onAlbum: () => void };
const photoPaths = [1, 2, 3, 4].map(n => `/demo/photo-${n}.svg`);

export default function Home({ onStart, onAlbum }: Props) {
  return <main className="home-page">
    <div className="home-glow one" aria-hidden="true"/><div className="home-glow two" aria-hidden="true"/>
    <section className="hero-section page-width">
      <div className="hero-copy">
        <div className="eyebrow"><span className="tiny-heart">♥</span> A LITTLE CORNER OF THE INTERNET, JUST FOR US</div>
        <h1>Oops, we're<br/><em>adorable.</em><span className="heading-spark">✳</span></h1>
        <p>For the goofy faces, stolen kisses, questionable poses, and all the tiny moments we never want to forget.</p>
        <div className="hero-buttons">
          <button className="pink-button" onClick={onStart}>let's get silly <span className="button-icon">↗</span></button>
          <button className="soft-button" onClick={onAlbum}><span aria-hidden="true">♡</span> our little album</button>
        </div>
        <div className="hand-note hero-hand-note">psst... you two look cute together! <span>↗</span></div>
      </div>
      <div className="hero-art" aria-label="Illustrated example Lovebug Booth photo strip">
        <span className="hero-floating-heart heart-one">♥</span><span className="hero-floating-heart heart-two">♡</span><span className="hero-floating-heart heart-three">✦</span>
        <div className="sample-strip-wrap">
          <div className="sample-strip">
            <span className="strip-heading">YOU + ME ♡</span>
            {photoPaths.map((src, index) => <img key={src} className="sample-photo" src={src} alt={`Illustrated sample booth pose ${index + 1}`} />)}
            <span className="sample-strip-foot">lovebug club · forever silly</span>
          </div>
        </div>
        <img className="hero-sticker hero-bow" src="/stickers/bow.svg" alt="" />
        <img className="hero-sticker hero-heart" src="/stickers/heart.svg" alt="" />
        <img className="hero-sticker hero-cherry" src="/stickers/cherries.svg" alt="" />
        <div className="scrap-tag tag-cuties">100% cuties! <span>♥</span></div>
        <div className="scrap-tag tag-date">a date worth keeping <span>✿</span></div>
        <span className="hero-doodle">these moments<br/>mean everything ♡</span>
      </div>
    </section>
    <section className="home-bottom page-width">
      <div className="mini-ribbon">MADE FOR TWO LITTLE LOVEBIRDS</div>
      <div className="home-feature-list">
        <div><span>01</span> <strong>strike silly poses</strong><small>four little moments</small></div>
        <div><span>02</span> <strong>decorate our chaos</strong><small>stickers, doodles & love notes</small></div>
        <div><span>03</span> <strong>keep it forever</strong><small>download your masterpiece</small></div>
      </div>
      <p className="small-note">No accounts needed to start. Just you, me, and a camera. ♡</p>
    </section>
  </main>;
}
