// ===== 에도시대 이름 생성기 (성별 인자 + 확장 코어/접미) =====

// 공통 접두
const PREFIXES = [
    { kanji:"お", kana:"お", hangul:"오" }
  ];
  
  // 여성 코어 (확장)
  const FEMALE_CORES = [
    { kanji:"春", kana:"はる", hangul:"하루" },
    { kanji:"夏", kana:"なつ", hangul:"나쓰" },
    { kanji:"秋", kana:"あき", hangul:"아키" },
    { kanji:"冬", kana:"ふゆ", hangul:"후유" },
    { kanji:"梅", kana:"うめ", hangul:"우메" },
    { kanji:"竹", kana:"たけ", hangul:"타케" },
    { kanji:"菊", kana:"きく", hangul:"기쿠" },
    { kanji:"咲", kana:"さき", hangul:"사키" },
    { kanji:"花", kana:"はな", hangul:"하나" },
    { kanji:"松", kana:"まつ", hangul:"마쓰" },
    { kanji:"初", kana:"はつ", hangul:"하쓰" },
    { kanji:"富", kana:"とみ", hangul:"토미" },
    { kanji:"福", kana:"ふく", hangul:"후쿠" },
    { kanji:"信", kana:"しん", hangul:"신" },
    { kanji:"寿", kana:"ひさ", hangul:"히사" },
    { kanji:"芳", kana:"よし", hangul:"요시" },
    { kanji:"光", kana:"みつ", hangul:"미쓰" },
    { kanji:"琴", kana:"こと", hangul:"코토" },
    { kanji:"園", kana:"その", hangul:"소노" },
    { kanji:"蓮", kana:"れん", hangul:"렌" },
    { kanji:"雪", kana:"ゆき", hangul:"유키" },
    { kanji:"桜", kana:"さくら", hangul:"사쿠라" },
    { kanji:"紅", kana:"べに", hangul:"베니" },
    { kanji:"綾", kana:"あや", hangul:"아야" },
    { kanji:"美", kana:"み", hangul:"미" },
    { kanji:"恵", kana:"めぐみ", hangul:"메구미" },
    { kanji:"椿", kana:"つばき", hangul:"쓰바키" },
    { kanji:"菖", kana:"あやめ", hangul:"아야메" },
    { kanji:"藤", kana:"ふじ", hangul:"후지" },
    { kanji:"萩", kana:"はぎ", hangul:"하기" },
    { kanji:"苑", kana:"えん", hangul:"엔" },
    { kanji:"瑞", kana:"みず", hangul:"미즈" },
    { kanji:"瑠", kana:"るり", hangul:"루리" },
    { kanji:"珠", kana:"たま", hangul:"타마" },
    { kanji:"玉", kana:"たま", hangul:"타마" },
    { kanji:"糸", kana:"いと", hangul:"이토" },
    { kanji:"絹", kana:"きぬ", hangul:"기누" },
    { kanji:"彩", kana:"あや", hangul:"아야" },
    { kanji:"舞", kana:"まい", hangul:"마이" },
    { kanji:"歌", kana:"うた", hangul:"우타" },
    { kanji:"詩", kana:"うた", hangul:"우타" }
  ];
  
  // 여성 접미 (확장)
  const FEMALE_SUFFIXES = [
    { kanji:"子", kana:"こ", hangul:"코" },
    { kanji:"江", kana:"え", hangul:"에" },
    { kanji:"代", kana:"よ", hangul:"요" },
    { kanji:"乃", kana:"の", hangul:"노" },
    { kanji:"香", kana:"か", hangul:"카" },
    { kanji:"恵", kana:"え", hangul:"에" },
    { kanji:"美", kana:"み", hangul:"미" },
    { kanji:"津", kana:"つ", hangul:"쓰" },
    { kanji:"音", kana:"ね", hangul:"네" },
    { kanji:"枝", kana:"え", hangul:"에" },
    { kanji:"世", kana:"よ", hangul:"요" },
    { kanji:"里", kana:"り", hangul:"리" },
    { kanji:"奈", kana:"な", hangul:"나" },
    { kanji:"加", kana:"か", hangul:"카" },
    { kanji:"女", kana:"め", hangul:"메" },
    { kanji:"姫", kana:"ひめ", hangul:"히메" },
    { kanji:"妙", kana:"たえ", hangul:"타에" },
    { kanji:"紀", kana:"のり", hangul:"노리" },
    { kanji:"瑠", kana:"る", hangul:"루" },
    { kanji:"珠", kana:"たま", hangul:"타마" },
    { kanji:"瑛", kana:"えい", hangul:"에이" },
    { kanji:"琴", kana:"こと", hangul:"코토" },
    { kanji:"鶴", kana:"つる", hangul:"쓰루" },
    { kanji:"鶯", kana:"うぐいす", hangul:"우구이스" }
  ];
  
  // 남성 코어 (확장)
  const MALE_CORES = [
    { kanji:"太", kana:"た", hangul:"타" },
    { kanji:"次", kana:"じ", hangul:"지" },
    { kanji:"三", kana:"さ", hangul:"사" },
    { kanji:"四", kana:"し", hangul:"시" },
    { kanji:"五", kana:"ご", hangul:"고" },
    { kanji:"六", kana:"ろく", hangul:"로쿠" },
    { kanji:"七", kana:"しち", hangul:"시치" },
    { kanji:"九", kana:"く", hangul:"쿠" },
    { kanji:"十", kana:"じゅう", hangul:"주" },
    { kanji:"兵", kana:"へい", hangul:"헤이" },
    { kanji:"吉", kana:"きち", hangul:"기치" },
    { kanji:"松", kana:"まつ", hangul:"마쓰" },
    { kanji:"助", kana:"すけ", hangul:"스케" },
    { kanji:"蔵", kana:"ぞう", hangul:"조" },
    { kanji:"平", kana:"へい", hangul:"헤이" },
    { kanji:"忠", kana:"ただ", hangul:"타다" },
    { kanji:"義", kana:"よし", hangul:"요시" },
    { kanji:"勇", kana:"いさむ", hangul:"이사무" },
    { kanji:"武", kana:"たけ", hangul:"타케" },
    { kanji:"力", kana:"りき", hangul:"리키" },
    { kanji:"正", kana:"まさ", hangul:"마사" },
    { kanji:"長", kana:"なが", hangul:"나가" },
    { kanji:"幸", kana:"ゆき", hangul:"유키" },
    { kanji:"直", kana:"なお", hangul:"나오" },
    { kanji:"栄", kana:"えい", hangul:"에이" },
    { kanji:"光", kana:"みつ", hangul:"미쓰" },
    { kanji:"竜", kana:"たつ", hangul:"타쓰" },
    { kanji:"虎", kana:"とら", hangul:"도라" },
    { kanji:"鷹", kana:"たか", hangul:"타카" },
    { kanji:"鯉", kana:"こい", hangul:"코이" },
    { kanji:"勘", kana:"かん", hangul:"칸" }
  ];
  
  // 남성 접미 (확장)
  const MALE_SUFFIXES = [
    { kanji:"郎", kana:"ろう", hangul:"로" },
    { kanji:"助", kana:"すけ", hangul:"스케" },
    { kanji:"兵衛", kana:"べえ", hangul:"베" },
    { kanji:"右衛門", kana:"えもん", hangul:"에몬" },
    { kanji:"吉", kana:"きち", hangul:"기치" },
    { kanji:"蔵", kana:"ぞう", hangul:"조" },
    { kanji:"之助", kana:"のすけ", hangul:"노스케" },
    { kanji:"三郎", kana:"さぶろう", hangul:"사부로" },
    { kanji:"八", kana:"はち", hangul:"하치" },
    { kanji:"平", kana:"へい", hangul:"헤이" },
    { kanji:"秀", kana:"ひで", hangul:"히데" },
    { kanji:"政", kana:"まさ", hangul:"마사" },
    { kanji:"恒", kana:"つね", hangul:"쓰네" },
    { kanji:"高", kana:"たか", hangul:"타카" },
    { kanji:"登", kana:"のぼる", hangul:"노보루" },
    { kanji:"盛", kana:"もり", hangul:"모리" },
    { kanji:"春", kana:"はる", hangul:"하루" },
    { kanji:"秋", kana:"あき", hangul:"아키" },
    { kanji:"之丞", kana:"のじょう", hangul:"노조" },
    { kanji:"弥", kana:"や", hangul:"야" },
    { kanji:"一馬", kana:"かずま", hangul:"카즈마" },
    { kanji:"清", kana:"きよ", hangul:"키요" }
  ];
  
  // 숫자 (남성 전용)
  const NUMERICS = [
    { kanji:"一", kana:"いち", hangul:"이치" },
    { kanji:"二", kana:"じ", hangul:"지" },
    { kanji:"三", kana:"さん", hangul:"산" },
    { kanji:"四", kana:"し", hangul:"시" },
    { kanji:"五", kana:"ご", hangul:"고" },
    { kanji:"六", kana:"ろく", hangul:"로쿠" },
    { kanji:"七", kana:"しち", hangul:"시치" },
    { kanji:"八", kana:"はち", hangul:"하치" },
    { kanji:"九", kana:"く", hangul:"쿠" },
    { kanji:"十", kana:"じゅう", hangul:"주" }
  ];
  
  // 랜덤 추출
  function sample(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  
  // 가중치 선택
  function weightedPick(arr) {
    const total = arr.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * total;
    for (const x of arr) {
      if ((r -= x.w) <= 0) return x.v;
    }
    return arr[arr.length - 1].v;
  }
  
  // 패턴 선택
  function pickPattern(gender) {
    if (gender === "female") {
      return weightedPick([
        { v:"O_CORE", w:35 },
        { v:"O_CORE_SUFFIX", w:30 },
        { v:"CORE_SUFFIX", w:35 }
      ]);
    } else {
      return weightedPick([
        { v:"CORE_SUFFIX", w:25 },
        { v:"O_CORE_SUFFIX", w:20 },
        { v:"O_NUM_SUFFIX", w:20 },
        { v:"O_NUM", w:15 },
        { v:"NUM_SUFFIX", w:20 }
      ]);
    }
  }
  
  // 조합
  function compose(parts) {
    return {
      kanji:  parts.map(p => p.kanji).join(""),
      kana:   parts.map(p => p.kana).join(""),
      hangul: parts.map(p => p.hangul).join("")
    };
  }
  
  // 이름 생성
  export default function generateName(gender = "female") {
    const pat = pickPattern(gender);
    if (gender === "female") {
      const core = sample(FEMALE_CORES);
      const suf = sample(FEMALE_SUFFIXES);
      if (pat === "O_CORE") return compose([sample(PREFIXES), core]);
      if (pat === "O_CORE_SUFFIX") return compose([sample(PREFIXES), core, suf]);
      return compose([core, suf]);
    } else {
      const core = sample(MALE_CORES);
      const suf = sample(MALE_SUFFIXES);
      const num = sample(NUMERICS);
      switch (pat) {
        case "CORE_SUFFIX": return compose([core, suf]);
        case "O_CORE_SUFFIX": return compose([sample(PREFIXES), core, suf]);
        case "O_NUM_SUFFIX": return compose([sample(PREFIXES), num, suf]);
        case "O_NUM": return compose([sample(PREFIXES), num]);
        case "NUM_SUFFIX": return compose([num, suf]);
      }
    }
  }
  
  // 여러 개 생성
  export function generateMany(gender, n = 20) {
    const seen = new Set();
    const out = [];
    while (out.length < n) {
      const name = generateName(gender);
      const key = name.kanji + "|" + name.kana;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(name);
      }
    }
    return out;
  }
