# Buzkıran Vadisi'ni iPhone'a kurmak (Mac ile)

Bu rehber oyunu kendi iPhone'una ilk kez kurman için. İlk kurulum yaklaşık 30–45 dakika sürer,
sonraki güncellemeler 5 dakika.

**Ücretsiz yol:** Yalnızca Apple kimliğin yeterli. Kurduğun uygulama 7 gün sonra açılmaz olur;
tekrar kurarsın.

**Ücretli yol:** Apple geliştirici hesabıyla (yıllık 99 $) bu süre sınırı kalkar. Ayrıca
TestFlight ile kurulum yapılabilir ve başkalarına dağıtılabilir.

## Bir kez yapılacaklar

1. **Xcode'u kur.** Mac App Store'dan "Xcode"u indir (ücretsiz, büyük bir dosya). Kurulunca
   bir kez aç, istenen ek bileşenleri yükle.
2. **Apple kimliğini Xcode'a ekle.** Xcode → Settings (Ayarlar) → Accounts → sol alttaki **+**
   → Apple ID. Eklediğin hesabın altında "Personal Team" görünecek.
3. **Takım kimliğini (Team ID) bul.** Xcode → Settings → Accounts → hesabın → Personal Team
   satırı. 10 karakterlik bir koddur, örneğin `A1B2C3D4E5`. Görünmüyorsa aşağıdaki
   5. adımdaki dışa aktarma penceresi de sorar.
4. **Godot 4.7.2'yi indir.** https://godotengine.org/download/archive/4.7.2-stable/ adresinden
   **macOS** için standart sürümü indir (".NET" olmayan). Uygulamayı Programlar klasörüne taşı.
5. **Oyunun kodunu indir.** https://github.com/oguzgunes0234-collab/Buzk-ran sayfasında
   **Code → Download ZIP**'e tıkla ve ZIP'i aç. Git biliyorsan klonlayabilirsin de.
6. **Projeyi Godot'da aç.** Godot → **Import** → açtığın klasördeki `oyun/project.godot`
   dosyasını seç → **Import & Edit**. İlk açılışta dosyaların işlenmesi bir dakika sürebilir.
   Oyunu Mac'te denemek için sağ üstteki ▶ düğmesine basabilirsin; fare, parmak gibi çalışır.
7. **iOS dışa aktarma şablonlarını kur.** Godot menüsü → Editor → **Manage Export Templates**
   → **Download and Install**. Yaklaşık 1,3 GB indirir.
8. **Takım kimliğini ve paket adını gir.** Project → **Export...** → soldan **iOS** →
   **App Store Team ID** kutusuna 3. adımdaki kodu yaz. **Bundle Identifier** alanında
   `com.oguzgunes.buzkiranvadisi` yazıyor. Xcode bu adın kullanıldığını söylerse sonuna bir şey
   ekle, örneğin `com.oguzgunes.buzkiranvadisi2`.
9. **iPhone'da geliştirici modunu aç.** iPhone'u kabloyla Mac'e bağla. iPhone → Ayarlar →
   Gizlilik ve Güvenlik → **Geliştirici Modu**'nu aç. Telefon yeniden başlar.

## Her kurulumda

1. **Godot → Project → Export... → iOS → Export Project.** Bir klasör seç, örneğin masaüstünde
   `buzkiran-ios`. **Export With Debug** kutusunu işaretli bırakabilirsin.
   Godot bir **Xcode projesi** üretir (`Buzkiran.xcodeproj`).
2. **`Buzkiran.xcodeproj` dosyasını çift tıklayıp Xcode'da aç.**
3. **İmzalamayı ayarla.** Sol üstte mavi "Buzkiran" proje simgesine tıkla. **Signing &
   Capabilities** sekmesinde:
   - **Automatically manage signing** kutusunu işaretle.
   - **Team** olarak kendi takımını seç.
4. **Telefona gönder.** Xcode'un üst ortasındaki cihaz listesinden iPhone'unu seç ve ▶ (Run)
   düğmesine bas.
5. **İlk kez "güvenilmeyen geliştirici" uyarısı çıkarsa:** iPhone → Ayarlar → Genel →
   **VPN ve Aygıt Yönetimi** → kendi Apple kimliğin → **Güven**. Sonra Xcode'da tekrar ▶.

## Kurduktan sonra benden istediklerim

1. **Tutarlılık testi:** Oyunun başlangıç ekranında **Tutarlılık testi → Testi başlat**'a bas.
   Çıkan "x/12 eşleşti" satırını bana yaz.
   - **12/12** çıkarsa, aynı atış iPhone'da ve bilgisayarda bit düzeyinde aynı sonucu veriyor
     demektir. Bot ile yaptığımız bölüm doğrulamaları telefona da geçerli olur.
   - **12/12'den azsa** ekran görüntüsünü gönder.
2. **Oynayıp izlenimini yaz.** Özellikle şunları merak ediyorum:
   - Nişan ve atış hissi web'e göre nasıl?
   - Titreşim hoş mu, rahatsız edici mi?
   - Oyun akıcı mı, takılma var mı?
   - Sesler duyuluyor mu? iPhone'un sessiz düğmesi açıkken ses çıkmaz.

## Sık karşılaşılan sorunlar

- **"No account for team" / imzalama hatası:** Adım 3'te Team seçili olmalı. Bundle Identifier
  başka biri tarafından kullanılıyorsa değiştir.
- **"Developer Mode disabled":** Bir kez yapılacaklar kısmındaki 9. adıma bak.
- **Godot "App Store Team ID" hatası veriyor:** Bir kez yapılacaklar kısmındaki 8. adımdaki kutu boş kalmış.
- **7 gün sonra uygulama açılmıyor:** Ücretsiz hesapla normal; "Her kurulumda" adımlarını tekrarla.
