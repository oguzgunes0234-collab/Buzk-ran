# Buzkıran Vadisi · gri kutu prototip

Kısa oturumlu, fizik tabanlı bir mobil bulmaca oyunu fikrinin **web prototipi**.
Oyuncu, arkadan bakan kameradan gülle fırlatır. Amacı buz kafeslerdeki
hayvanları kurtarmak, totemleri devirmek ve yumurtalı yuvaya zarar vermemek.

Şu anki sürüm: **v4.1**. Grafikler bilerek "gri kutu": yalnızca şekiller ve renkler var, son sanat yok.

## Bu prototip neyi sınıyor, neyi sınamıyor

**Sınadığı:** Oyun hissi (nişan, yıkım, mermi seçimi) ve telefonda kameranın okunabilirliği.

**Kanıtlamadığı:**
- pazar talebi;
- reklam geliri;
- son sanat kalitesi;
- son motor performansı.

Bu kod Unity gibi son motora taşınmayabilir. Motor seçimi bu ortamın sınırlarına göre yapılmamalı.

## Çalıştırma

```bash
npm install
npm run build          # dist/game.js, dist/index.html, dist/test.html üretir
```

`dist/test.html` dosyasını tarayıcıda açarak oynayabilirsin. `dist/index.html` ise yayınlanan
sayfanın gövdesi; tek başına açılmaz.

## Klasörler

| Klasör | İçerik |
|---|---|
| `src/sim.js` | Deterministik fizik çekirdeği (Rapier 3D). Görüntü, zaman ve rastgelelik yok. |
| `src/levels.js` | 10 bölümün düzeni |
| `src/render.js` | three.js ile çizim, efektler, hedef görünürlüğü ölçümü |
| `src/main.js` | Arayüz, dokunmatik nişan, tur, değerlendirme ekranı |
| `src/audio.js` | Web Audio ile üretilen geçici sesler |
| `src/detmath.js` | Platformdan bağımsız sinüs/kosinüs ve durum özeti (hash) |
| `src/selftest.js`, `src/reference.js` | Cihazlar arası tutarlılık testi ve beklenen sonuçlar |
| `web/index.html` | Sayfa iskeleti ve stiller |
| `tools/` | Derleme, test botu ve tarayıcı testleri |
| `rapor/` | Bot ve uçtan uca test çıktıları (sürüm sürüm) |
| `docs/ekran/` | Telefon boyutunda (390×844) ekran görüntüleri |

## Testler ve araçlar

| Komut | Ne yapar |
|---|---|
| `npm run bot` | Her bölümde, her mermi türüyle ızgara taraması yapar. Yön −15°…+15°, yükseklik 5°…70°, 1°'lik adım. Tek atışta çözüm yoksa ışın aramasıyla (beam search; genişlik 4, sonraki atışlar 2°'lik adım) çok atışlı çözüm arar. `--need` seçeneği "bu özel mermi olmadan da çözülüyor mu?" diye kontrol eder. |
| `npm run reference` | Botun bulduğu çözümlerden tutarlılık testinin beklenen sonuçlarını üretir. Önce `npm run bot` çalıştırılmalı. |
| `npm run e2e` | Gerçek arayüzle 10 bölümlük turu oynar. İki kaybetme yolunu ve tekrar denemeyi dener, özet metni üretir. |
| `npm run lostcage` | Kırılmadan platform dışına düşen, yani kaybolan hedef olup olmadığını kontrol eder. |
| `node tools/levelshots.mjs` | Her bölümün ekran görüntüsünü alır, hedef görünürlüğünü ve boyutunu ölçer. |
| `node tools/perf.mjs` | Yavaşlatılmış işlemcide fizik adımının süresini ölçer. Yalnızca fizik; çizim ölçülmez. |
| `node tools/friction.mjs` | Rapier'deki eksen kilidi bulgusunu gösterir (aşağıda). |
| `tools/probe-*.mjs`, `tools/stonehint.mjs` | Tasarım denemeleri: taş totem, kafes sırası, hedef bazında isabet. |

Tarayıcı testleri Chromium kullanır. Başka bir makinede tarayıcının yolunu
`CHROME_PATH` ortam değişkeniyle vermek gerekir.

**Botun sınırı:** Bot yalnızca taranan sınırlar ve adım büyüklüğü içinde çözüm olup olmadığını ve kazandıran bölgenin
genişliğini ölçer. Oyuncunun çözümü bulacağını, anlayacağını ya da eğleneceğini göstermez.
Adımların arasına düşen dar çözümleri kaçırabilir. "Bulunamadı" demek "imkânsız" demek değildir.

## Tutarlılık (determinizm) kuralları

Aynı başlangıç durumu ve aynı sayısal atış girdisiyle, masaüstünde ve telefonda aynı sonucun çıkması hedeflenir:

- Sabit zaman adımı kullanılır: 1/60 saniye, 8 çözücü yinelemesi.
- Rapier'in deterministik derlemesi kullanılır.
- Cisimler her zaman aynı sırayla oluşturulur.
- Atış girdisi tam sayıdır (derecenin onda biri). Açılar `Math.sin`/`Math.cos` ile değil, `detmath.js` ile hesaplanır.
- İki atış arasında dünya donar, yani oyuncunun beklemesi sonucu değiştirmez.
- Kırılmalar, patlamalar ve hedef kontrolleri sabit sırayla işlenir.
- Her 30 adımda bir durum özeti (FNV-1a hash) alınır ve karşılaştırılır.

Bu kurallar tutarlılığı yalnızca bu koşullar altında sağlar. Tutarlılık, oyunun eğlenceli ya da adil olduğunu da göstermez.

**Motor bulgusu:** Rapier'de eksen kilitleri (`enabledTranslations`, `enabledRotations`) zeminle sürtünmeyi
tamamen ortadan kaldırıyor. v3'teki 2.5D modda blokların kaygan olmasının nedeni buydu.
`tools/friction.mjs` bunu gösterir.

## Bölümler (v4.1)

| # | Ad | Öğrettiği | Mermiler |
|---|---|---|---|
| 1 | İlk atış | nişan | Gülle ×3 |
| 2 | Devrilen kule | devirme | Gülle ×2 |
| 3 | Sağ ve sol | yön | Gülle ×3 |
| 4 | Kırılgan buz | kırılgan buz | Gülle ×3 |
| 5 | Ağır gülle | ağır gülle, taş | Ağır, Gülle |
| 6 | Köz | patlama | Köz, Gülle ×2 |
| 7 | Totemler | devirme hedefi | Gülle ×3 |
| 8 | Yuvayı koru | koruma hedefi | Gülle ×2, Köz |
| 9 | Karışık | taş totem, birleşim | Gülle, Ağır, Köz |
| 10 | Büyük kale | birleşim | Gülle ×2, Ağır, Köz |

## Son ölçümler (v4.1)

Ölçümler Chromium'da ve Node'da yapıldı. iPhone'daki tutarlılık testi sonucu henüz yok.

- **Tutarlılık testi:** Chromium'da 12/12.
- **Uçtan uca tur:** 10 bölüm geçildi, iki kaybetme yolu çalışıyor, konsol hatası yok.
- **Hedef görünürlüğü:** Ortalama %93, en kötü %78.
- **Kaybolan hedef:** 8.976 ilk atışta 0.
- **Taş totem:** Yalnızca Ağır gülle deviriyor (ilk atış, 2°'lik ızgara). B9'da 528 atışın 20'si, B10'da 15'i isabet ediyor; Gülle ve Köz'de 0.
- **B9 ve B10:** Ağır gülle zorunlu. Köz zorunlu değil, ama kafes sırasını çok daha kolay kırıyor. Köz üç kafesi tek atışta 528 atışın 19'unda kırıyor; Gülle üçünü birden hiç kıramıyor.
- **Bot tablosu:** `rapor/bot-v41.json`.

## Sürüm geçmişi

| Etiket | İçerik |
|---|---|
| `v3` | 8 bölüm; 3D (arkadan) ve 2.5D (yandan) kamerayı karşılaştıran sürüm |
| `v4` | Yalnızca 3D kamera, 10 bölüm, 3 mermi (Gülle, Ağır, Köz), taş ve buz, totem ve yuva hedefleri |
| `v4.1` | B9 ve B10 yeniden kuruldu, taş totem eklendi, kaybedince ipucu gösteriliyor |

Eski bir sürüme bakmak için örneğin `git checkout v3` komutunu kullanabilirsin.

## Bilinen riskler

- Taş totem önce tek başına öğretilmeden, doğrudan birleşim bölümünde (B9) geliyor.
- B9 ve B10'da nişan pencereleri dar. B10'un bulunan çözümü yüksek (67°) bir Köz atışı içeriyor.
- Çeşitlilik kural yükünü artırıyor: 10 bölümde 3 mermi, 3 malzeme ve 3 hedef türü var.
- Şimdiye kadarki geri bildirim tek bir oyuncudan geldi; başka oyunculardan veri yok.
