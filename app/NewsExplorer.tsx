"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccountPanel } from "./AccountPanel";
import { useTerrandipAuth } from "./auth-context";

type Article = {
  id: string;
  title: string;
  description: string;
  url: string;
  imageUrl: string | null;
  source: string;
  sourceUrl: string | null;
  publishedAt: string | null;
  country: string[];
  category: string[];
  language: string | null;
};

type NewsResponse = {
  articles?: Article[];
  pickedCountry?: string;
  pickedCountries?: string[];
  nextPage?: string | null;
  cached?: boolean;
  message?: string;
  error?: string;
  errorCode?: string;
  retryAfterSeconds?: number;
};

type NewsPage = {
  articles: Article[];
  randomOrder: Article[];
  nextPage: string | null;
};

type Translation = {
  title: string;
  description: string;
  detectedLanguage: string | null;
};

type ErrorState = {
  code: string;
  message: string;
  retryAfterSeconds?: number;
};

class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code = "UNKNOWN",
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

const regions = [
  ["world", "世界すべて"],
  ["asia", "アジア"],
  ["europe", "ヨーロッパ"],
  ["americas", "南北アメリカ"],
  ["africa", "アフリカ"],
  ["middle-east", "中東"],
  ["oceania", "オセアニア"],
] as const;

const countriesByRegion: Record<string, string[]> = {
  world: ["ae", "ar", "au", "br", "ca", "cn", "de", "eg", "es", "fr", "gb", "id", "in", "it", "jp", "ke", "kr", "mx", "ng", "nz", "sa", "se", "sg", "us", "za"],
  asia: ["cn", "id", "in", "jp", "kr", "sg"],
  europe: ["de", "es", "fr", "gb", "it", "se"],
  americas: ["ar", "br", "ca", "mx", "us"],
  africa: ["eg", "ke", "ng", "za"],
  "middle-east": ["ae", "eg", "sa"],
  oceania: ["au", "nz"],
};

const categories = [
  ["all", "すべて"],
  ["top", "トップ"],
  ["business", "ビジネス"],
  ["technology", "テクノロジー"],
  ["science", "科学"],
  ["health", "健康"],
  ["environment", "環境"],
  ["politics", "政治"],
  ["sports", "スポーツ"],
  ["entertainment", "エンタメ"],
] as const;

const languages = [
  ["auto", "すべての言語"],
  ["ja", "日本語"],
  ["en", "English"],
  ["es", "Español"],
  ["fr", "Français"],
  ["de", "Deutsch"],
  ["pt", "Português"],
  ["zh", "中文"],
  ["ar", "العربية"],
] as const;

const translationLanguages = [
  ["JA", "日本語"],
  ["EN-US", "English"],
  ["ES", "Español"],
  ["FR", "Français"],
  ["DE", "Deutsch"],
  ["IT", "Italiano"],
  ["PT-BR", "Português"],
  ["ZH", "中文"],
  ["KO", "한국어"],
] as const;

const sortOptions = [
  ["random", "ランダム"],
  ["newest", "新しい順"],
  ["oldest", "古い順"],
  ["source", "配信元順"],
] as const;

const emptyArticles: Article[] = [];

const countryNames: Record<string, string> = {
  ae: "UAE", ar: "アルゼンチン", au: "オーストラリア", br: "ブラジル",
  ca: "カナダ", cn: "中国", de: "ドイツ", eg: "エジプト", es: "スペイン",
  fr: "フランス", gb: "イギリス", id: "インドネシア", in: "インド",
  it: "イタリア", jp: "日本", ke: "ケニア", kr: "韓国", mx: "メキシコ",
  ng: "ナイジェリア", nz: "ニュージーランド", sa: "サウジアラビア",
  se: "スウェーデン", sg: "シンガポール", us: "アメリカ", za: "南アフリカ",
};

const countryCoordinates: Record<string, { lat: number; lon: number }> = {
  ae: { lat: 24.45, lon: 54.38 }, ar: { lat: -34.6, lon: -58.38 },
  au: { lat: -35.28, lon: 149.13 }, br: { lat: -15.79, lon: -47.88 },
  ca: { lat: 45.42, lon: -75.7 }, cn: { lat: 39.9, lon: 116.4 },
  de: { lat: 52.52, lon: 13.4 }, eg: { lat: 30.04, lon: 31.24 },
  es: { lat: 40.42, lon: -3.7 }, fr: { lat: 48.86, lon: 2.35 },
  gb: { lat: 51.51, lon: -0.13 }, id: { lat: -6.21, lon: 106.85 },
  in: { lat: 28.61, lon: 77.21 }, it: { lat: 41.9, lon: 12.5 },
  jp: { lat: 35.68, lon: 139.69 }, ke: { lat: -1.29, lon: 36.82 },
  kr: { lat: 37.57, lon: 126.98 }, mx: { lat: 19.43, lon: -99.13 },
  ng: { lat: 9.08, lon: 7.4 }, nz: { lat: -41.29, lon: 174.78 },
  sa: { lat: 24.71, lon: 46.68 }, se: { lat: 59.33, lon: 18.07 },
  sg: { lat: 1.35, lon: 103.82 }, us: { lat: 38.9, lon: -77.04 },
  za: { lat: -25.75, lon: 28.23 }, world: { lat: 0, lon: 0 },
};

const countryCodeAliases: Record<string, string> = {
  "united arab emirates": "ae", argentina: "ar", australia: "au", brazil: "br",
  canada: "ca", china: "cn", germany: "de", egypt: "eg", spain: "es",
  france: "fr", "united kingdom": "gb", indonesia: "id", india: "in",
  italy: "it", japan: "jp", kenya: "ke", "south korea": "kr", korea: "kr",
  mexico: "mx", nigeria: "ng", "new zealand": "nz", "saudi arabia": "sa",
  sweden: "se", singapore: "sg", "united states": "us",
  "united states of america": "us", "south africa": "za",
};

function coordinateLabel(value: number, positive: string, negative: string) {
  return `${Math.abs(value).toFixed(1)}°${value >= 0 ? positive : negative}`;
}

function GlobeVisual({
  coordinates,
  label,
  rotating = false,
}: {
  coordinates: { lat: number; lon: number };
  label: string;
  rotating?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
    if (!gl) {
      const fallbackContext = canvas.getContext("2d");
      if (!fallbackContext) return;
      const fallbackTexture = new Image();
      fallbackTexture.src = "/earth-map.jpg";
      fallbackTexture.onload = () => {
        fallbackContext.save();
        fallbackContext.beginPath();
        fallbackContext.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2 - 4, 0, Math.PI * 2);
        fallbackContext.clip();
        fallbackContext.drawImage(fallbackTexture, 0, 0, canvas.width, canvas.height);
        fallbackContext.restore();
      };
      return;
    }

    const vertexSource = `
      attribute vec2 aPosition;
      varying vec2 vPosition;
      void main() {
        vPosition = aPosition;
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;
    const fragmentSource = `
      precision highp float;
      varying vec2 vPosition;
      uniform sampler2D uTexture;
      uniform float uLatitude;
      uniform float uLongitude;

      const float PI = 3.141592653589793;

      void main() {
        vec2 point = vPosition;
        float radiusSquared = dot(point, point);
        if (radiusSquared > 1.0) discard;

        float depth = sqrt(max(0.0, 1.0 - radiusSquared));
        float cosLat = cos(uLatitude);
        float sinLat = sin(uLatitude);
        float cosLon = cos(uLongitude);
        float sinLon = sin(uLongitude);
        vec3 east = vec3(-sinLon, cosLon, 0.0);
        vec3 north = vec3(-sinLat * cosLon, -sinLat * sinLon, cosLat);
        vec3 forward = vec3(cosLat * cosLon, cosLat * sinLon, sinLat);
        vec3 world = normalize(east * point.x + north * point.y + forward * depth);

        float latitude = asin(clamp(world.z, -1.0, 1.0));
        float longitude = atan(world.y, world.x);
        vec2 texturePoint = vec2((longitude + PI) / (2.0 * PI), (PI / 2.0 - latitude) / PI);
        vec3 color = texture2D(uTexture, texturePoint).rgb;

        float gridStep = PI / 6.0;
        float latitudeDistance = abs(fract(latitude / gridStep + 0.5) - 0.5) * gridStep;
        float longitudeDistance = abs(fract(longitude / gridStep + 0.5) - 0.5) * gridStep * max(0.18, cos(latitude));
        float gridLine = 1.0 - smoothstep(0.004, 0.012, min(latitudeDistance, longitudeDistance));
        color = mix(color, vec3(0.85, 1.0, 0.29), gridLine * 0.24);

        float edgeLight = 0.58 + 0.42 * depth;
        color *= edgeLight;
        float rim = smoothstep(0.965, 0.995, sqrt(radiusSquared));
        color = mix(color, vec3(0.85, 1.0, 0.29), rim * 0.7);
        gl_FragColor = vec4(color, 1.0);
      }
    `;

    const compileShader = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertexShader || !fragmentShader) return;
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

    const positionBuffer = gl.createBuffer();
    const earthTexture = gl.createTexture();
    if (!positionBuffer || !earthTexture) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.useProgram(program);
    const positionLocation = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    const latitudeLocation = gl.getUniformLocation(program, "uLatitude");
    const longitudeLocation = gl.getUniformLocation(program, "uLongitude");
    const textureLocation = gl.getUniformLocation(program, "uTexture");
    gl.uniform1i(textureLocation, 0);
    gl.clearColor(0, 0, 0, 0);

    let animationFrame: number | null = null;
    let disposed = false;
    const texture = new Image();
    texture.src = "/earth-map.jpg";
    texture.onload = () => {
      if (disposed) return;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, earthTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture);

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const startedAt = performance.now();
      const render = (now: number) => {
        if (disposed) return;
        const elapsedSeconds = (now - startedAt) / 1000;
        const rotationRadians = rotating && !reduceMotion ? elapsedSeconds * (2 * Math.PI / 180) : 0;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(latitudeLocation, coordinates.lat * Math.PI / 180);
        gl.uniform1f(longitudeLocation, coordinates.lon * Math.PI / 180 + rotationRadians);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        if (rotating && !reduceMotion) animationFrame = window.requestAnimationFrame(render);
      };
      render(startedAt);
    };

    return () => {
      disposed = true;
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      gl.deleteTexture(earthTexture);
      gl.deleteBuffer(positionBuffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    };
  }, [coordinates.lat, coordinates.lon, rotating]);

  return (
    <div className="globe-grid">
      <canvas
        ref={canvasRef}
        width="560"
        height="560"
        aria-label={rotating ? "ゆっくり回転する地球儀" : `${label}を中心にした地球儀`}
      />
      <i className="globe-pin" />
      <div className="coordinate-readout">
        <span>{rotating ? "GLOBAL" : coordinateLabel(coordinates.lat, "N", "S")}</span>
        <strong>{label}</strong>
        <span>{rotating ? "LIVE" : coordinateLabel(coordinates.lon, "E", "W")}</span>
      </div>
    </div>
  );
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function formatDate(value: string | null) {
  if (!value) return "時刻不明";
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return "時刻不明";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function articleTimestamp(article: Article) {
  if (!article.publishedAt) return 0;
  const value = article.publishedAt.includes("T")
    ? article.publishedAt
    : article.publishedAt.replace(" ", "T") + "Z";
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function articleCountryCode(
  article: Article,
  fallbackCountry: string | null,
  exploreMode: "single" | "mix",
) {
  const rawCountry = exploreMode === "single" && fallbackCountry
    ? fallbackCountry.toLowerCase()
    : article.country?.[0]?.toLowerCase() || fallbackCountry?.toLowerCase() || "world";
  return countryCodeAliases[rawCountry] || rawCountry;
}

function asErrorState(error: unknown, fallback: string): ErrorState {
  if (error instanceof ApiRequestError) {
    return { code: error.code, message: error.message, retryAfterSeconds: error.retryAfterSeconds };
  }
  return { code: "UNKNOWN", message: error instanceof Error ? error.message : fallback };
}

function errorHeading(code: string) {
  if (code === "CONFIGURATION") return "設定がまだ完了していません";
  if (code === "NO_RESULTS") return "この条件の記事はありません";
  if (code === "RATE_LIMITED" || code === "SERVICE_BUDGET") return "安全のため一時停止しています";
  if (code === "UPSTREAM_QUOTA") return "本日の取得枠に達しました";
  if (code === "UPSTREAM_TIMEOUT") return "応答に時間がかかっています";
  return "ニュースを受信できませんでした";
}

function ArticleImage({ article }: { article: Article }) {
  const [failed, setFailed] = useState(false);
  if (!article.imageUrl || failed) {
    return (
      <div className="image-fallback" aria-label="記事画像なし">
        <span>WORLD</span>
        <span>NEWS</span>
        <i />
      </div>
    );
  }
  return (
    // News images come from many independent publishers. Loading them directly
    // avoids turning this server into an unrestricted image proxy.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="article-image"
      src={article.imageUrl}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
    />
  );
}

export function NewsExplorer() {
  const auth = useTerrandipAuth();
  const [exploreMode, setExploreMode] = useState<"single" | "mix">("single");
  const [region, setRegion] = useState("world");
  const [selectedCountry, setSelectedCountry] = useState("random");
  const [category, setCategory] = useState("all");
  const [language, setLanguage] = useState("auto");
  const [sortMode, setSortMode] = useState("random");
  const [newsPages, setNewsPages] = useState<NewsPage[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pickedCountry, setPickedCountry] = useState<string | null>(null);
  const [pickedCountries, setPickedCountries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState<ErrorState | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [readerArticleId, setReaderArticleId] = useState<string | null>(null);
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState("JA");
  const [translationCache, setTranslationCache] = useState<Record<string, Translation>>({});
  const translationCacheRef = useRef<Record<string, Translation>>({});
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const newsListTopRef = useRef<HTMLElement | null>(null);
  const currentPage = newsPages[pageIndex];
  const articles = currentPage?.articles || emptyArticles;
  const availableCountries = countriesByRegion[region] || countriesByRegion.world;

  const scrollToNewsListTop = useCallback(() => {
    window.requestAnimationFrame(() => {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      newsListTopRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
      });
    });
  }, []);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPageError(null);
    setReaderArticleId(null);
    try {
      const query = new URLSearchParams({ region, category, language, mode: exploreMode });
      if (exploreMode === "single") {
        const country = selectedCountry === "random"
          ? availableCountries[Math.floor(Math.random() * availableCountries.length)]
          : selectedCountry;
        query.set("country", country);
      } else {
        query.set("countries", shuffle(availableCountries).slice(0, Math.min(5, availableCountries.length)).join(","));
      }
      const response = await fetch(`/api/news?${query}`);
      const data = (await response.json()) as NewsResponse;
      if (!response.ok || !data.articles?.length) {
        throw new ApiRequestError(
          data.error || "条件に合うニュースが見つかりませんでした。",
          data.errorCode,
          data.retryAfterSeconds,
        );
      }
      setNewsPages([{
        articles: data.articles,
        randomOrder: shuffle(data.articles),
        nextPage: data.nextPage || null,
      }]);
      setPageIndex(0);
      setPickedCountry(data.pickedCountry || null);
      setPickedCountries(data.pickedCountries || (data.pickedCountry ? [data.pickedCountry] : []));
    } catch (caught) {
      setNewsPages([]);
      setPageIndex(0);
      setError(asErrorState(caught, "ニュースの取得に失敗しました。"));
    } finally {
      setLoading(false);
    }
  }, [availableCountries, region, category, language, exploreMode, selectedCountry]);

  const loadPreviousPage = useCallback(() => {
    if (pageIndex <= 0 || pageLoading) return;
    setReaderArticleId(null);
    setPageError(null);
    setPageIndex((current) => current - 1);
    scrollToNewsListTop();
  }, [pageIndex, pageLoading, scrollToNewsListTop]);

  const loadNextPage = useCallback(async () => {
    if (pageLoading) return;
    if (newsPages[pageIndex + 1]) {
      setReaderArticleId(null);
      setPageError(null);
      setPageIndex((current) => current + 1);
      scrollToNewsListTop();
      return;
    }
    const nextPage = newsPages[pageIndex]?.nextPage;
    if (!nextPage || !pickedCountry) return;

    setPageLoading(true);
    setPageError(null);
    try {
      const query = new URLSearchParams({
        region,
        category,
        language,
        mode: exploreMode,
        page: nextPage,
      });
      if (exploreMode === "mix") query.set("countries", pickedCountries.join(","));
      else query.set("country", pickedCountry);
      const response = await fetch(`/api/news?${query}`);
      const data = (await response.json()) as NewsResponse;
      if (!response.ok || !data.articles?.length) {
        throw new ApiRequestError(
          data.error || "同じ国の次のニュースが見つかりませんでした。",
          data.errorCode,
          data.retryAfterSeconds,
        );
      }
      setNewsPages((current) => [
        ...current.slice(0, pageIndex + 1),
        {
          articles: data.articles!,
          randomOrder: data.articles!,
          nextPage: data.nextPage || null,
        },
      ]);
      setReaderArticleId(null);
      setPageIndex((current) => current + 1);
      scrollToNewsListTop();
    } catch (caught) {
      setPageError(asErrorState(caught, "次のニュースを取得できませんでした。"));
    } finally {
      setPageLoading(false);
    }
  }, [category, exploreMode, language, newsPages, pageIndex, pageLoading, pickedCountries, pickedCountry, region, scrollToNewsListTop]);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchNews(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchNews]);

  const orderedArticles = useMemo(() => {
    if (sortMode === "newest") {
      return [...articles].sort((a, b) => articleTimestamp(b) - articleTimestamp(a));
    }
    if (sortMode === "oldest") {
      return [...articles].sort((a, b) => articleTimestamp(a) - articleTimestamp(b));
    }
    if (sortMode === "source") {
      return [...articles].sort((a, b) => a.source.localeCompare(b.source, "ja"));
    }
    return currentPage?.randomOrder || articles;
  }, [articles, currentPage?.randomOrder, sortMode]);

  const rawArticleCountry = pickedCountry?.toLowerCase()
    || orderedArticles[0]?.country?.[0]?.toLowerCase()
    || "world";
  const articleCountry = countryCodeAliases[rawArticleCountry] || rawArticleCountry;
  const locationLabel = exploreMode === "mix"
    ? "WORLD MIX"
    : countryNames[articleCountry] || articleCountry.toUpperCase();
  const feedLocationLabel = exploreMode === "mix"
    ? `${pickedCountries.length}か国ミックス`
    : `${locationLabel}限定`;
  const coordinates = exploreMode === "mix"
    ? countryCoordinates.world
    : countryCoordinates[articleCountry] || countryCoordinates.world;
  const readerArticle = readerArticleId
    ? articles.find((item) => item.id === readerArticleId) || null
    : null;
  const readerTranslation = readerArticle
    ? translationCache[`${readerArticle.id}:${targetLanguage}`]
    : undefined;
  const readerTitle = readerArticle && translationEnabled && readerTranslation
    ? readerTranslation.title
    : readerArticle?.title;
  const readerDescription = readerArticle && translationEnabled && readerTranslation
    ? readerTranslation.description
    : readerArticle?.description;

  const categoryLabel = useMemo(
    () => categories.find(([value]) => value === category)?.[1] || "すべて",
    [category],
  );

  useEffect(() => {
    if (!translationEnabled || !orderedArticles.length) return;

    const pendingArticles = orderedArticles.filter(
      (item) => !translationCacheRef.current[`${item.id}:${targetLanguage}`],
    );
    if (!pendingArticles.length) {
      setTranslationLoading(false);
      setTranslationError(null);
      return;
    }

    const controller = new AbortController();
    const translate = async () => {
      setTranslationLoading(true);
      setTranslationError(null);
      try {
        const texts: string[] = [];
        const translationLayout = pendingArticles.map((item) => {
          const titleIndex = texts.push(item.title) - 1;
          const descriptionIndex = item.description ? texts.push(item.description) - 1 : -1;
          return { item, titleIndex, descriptionIndex };
        });
        const response = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts, targetLanguage }),
          signal: controller.signal,
        });
        const data = (await response.json()) as {
          translations?: string[];
          detectedLanguage?: string | null;
          error?: string;
        };
        if (!response.ok || !data.translations?.[0]) {
          throw new Error(data.error || "翻訳できませんでした。");
        }
        const additions: Record<string, Translation> = {};
        translationLayout.forEach(({ item, titleIndex, descriptionIndex }) => {
          additions[`${item.id}:${targetLanguage}`] = {
            title: data.translations![titleIndex] || item.title,
            description: descriptionIndex >= 0
              ? data.translations![descriptionIndex] || item.description
              : item.description,
            detectedLanguage: data.detectedLanguage || null,
          };
        });
        translationCacheRef.current = { ...translationCacheRef.current, ...additions };
        setTranslationCache(translationCacheRef.current);
      } catch (caught) {
        if (!controller.signal.aborted) {
          setTranslationError(caught instanceof Error ? caught.message : "翻訳できませんでした。");
        }
      } finally {
        if (!controller.signal.aborted) setTranslationLoading(false);
      }
    };
    void translate();
    return () => controller.abort();
  }, [orderedArticles, targetLanguage, translationEnabled]);

  useEffect(() => {
    if (!readerArticle) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReaderArticleId(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [readerArticle]);

  useEffect(() => {
    if (!accountOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountOpen]);

  const hasPreviousPage = pageIndex > 0;
  const hasNextPage = Boolean(newsPages[pageIndex + 1] || currentPage?.nextPage);
  const pageNavigation = (position: "top" | "bottom") => (
    <div
      className={`page-navigation page-navigation-${position}`}
      aria-label={exploreMode === "mix" ? "選ばれた国々のニュースを移動" : "同じ国のニュースを移動"}
    >
      <span>{feedLocationLabel}の記事</span>
      <div className="page-navigation-actions">
        {position === "top" && (
          <div className="page-translation" role="group" aria-label="記事の翻訳設定">
            <span>記事を翻訳</span>
            <button
              type="button"
              className={`switch ${translationEnabled ? "is-on" : ""}`}
              role="switch"
              aria-checked={translationEnabled}
              onClick={() => setTranslationEnabled((enabled) => !enabled)}
            >
              <i /><b>{translationEnabled ? "ON" : "OFF"}</b>
            </button>
            <select
              aria-label="翻訳先の言語"
              value={targetLanguage}
              disabled={!translationEnabled}
              onChange={(event) => setTargetLanguage(event.target.value)}
            >
              {translationLanguages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        )}
        <div className="page-controls">
          <button
            type="button"
            onClick={loadPreviousPage}
            disabled={!hasPreviousPage || pageLoading}
            aria-label={exploreMode === "mix" ? "選ばれた国々の前の10件へ" : "同じ国の前の10件へ"}
          >
            ←
          </button>
          <b>{pageLoading ? "読み込み中" : `PAGE ${String(pageIndex + 1).padStart(2, "0")}`}</b>
          <button
            type="button"
            onClick={() => void loadNextPage()}
            disabled={!hasNextPage || pageLoading}
            aria-label={exploreMode === "mix" ? "選ばれた国々の次の10件へ" : "同じ国の次の10件へ"}
          >
            →
          </button>
        </div>
      </div>
    </div>
  );

  async function shareArticle(article: Article) {
    try {
      if (navigator.share) {
        await navigator.share({ title: article.title, url: article.url });
      } else {
        await navigator.clipboard.writeText(article.url);
        setCopiedId(article.id);
        window.setTimeout(() => setCopiedId(null), 1800);
      }
    } catch {
      // A cancelled share sheet needs no error state.
    }
  }

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="TERRANDIP ホーム">
          <span className="brand-mark">T</span>
          <span>TERRANDIP</span>
        </a>
        <div className="live-indicator"><i /> LIVE WORLD FEED</div>
        <div className="topbar-actions">
          <button
            type="button"
            className={`account-trigger ${auth.user ? "is-signed-in" : ""}`}
            aria-label={auth.user ? `${auth.displayName}のアカウント` : "ログインまたはアカウント作成"}
            onClick={() => setAccountOpen(true)}
          >
            {auth.user ? (
              <><i>{(auth.displayName || "T").slice(0, 1).toUpperCase()}</i><span>{auth.displayName}</span></>
            ) : (
              <><i>+</i><span>ログイン / 登録</span></>
            )}
          </button>
          <button className="filter-toggle" onClick={() => setFilterOpen((open) => !open)}>
            {filterOpen ? "閉じる" : "絞り込む"} <span>⌄</span>
          </button>
        </div>
      </header>

      <section className={`filter-panel ${filterOpen ? "is-open" : ""}`} aria-hidden={!filterOpen}>
        <label>
          <span>地域</span>
          <select
            value={region}
            onChange={(event) => {
              const nextRegion = event.target.value;
              setRegion(nextRegion);
              if (selectedCountry !== "random" && !countriesByRegion[nextRegion]?.includes(selectedCountry)) {
                setSelectedCountry("random");
              }
            }}
          >
            {regions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>カテゴリ</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>言語</span>
          <select value={language} onChange={(event) => setLanguage(event.target.value)}>
            {languages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </section>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span>DISCOVER</span><span>BEYOND BORDERS</span></div>
          <h1>世界のニュースを、<br /><em>偶然</em>から。</h1>
          <p className="hero-lead">
            アルゴリズムの外へ出よう。ボタンを押すたび、<br className="desktop-only" />
            世界のどこかで起きている出来事へ。
          </p>
          <div className="mode-picker" aria-label="ニュースの探索方法">
            <button
              type="button"
              className={exploreMode === "single" ? "is-active" : ""}
              aria-pressed={exploreMode === "single"}
              onClick={() => setExploreMode("single")}
            >
              <span>01</span> 1カ国深掘り
            </button>
            <button
              type="button"
              className={exploreMode === "mix" ? "is-active" : ""}
              aria-pressed={exploreMode === "mix"}
              onClick={() => setExploreMode("mix")}
            >
              <span>02</span> 世界ミックス
            </button>
          </div>
          <p className={`mode-help mode-help-${exploreMode}`}>
            <b>{exploreMode === "single" ? "1カ国限定" : "複数国を横断"}</b>
            {exploreMode === "single"
              ? "選択した1カ国に一致する記事だけを表示します。"
              : "選ばれた最大5カ国の記事を、1つの一覧に混ぜて表示します。"}
          </p>
          {exploreMode === "single" && (
            <label className="country-picker">
              <span>国を選ぶ</span>
              <select
                value={selectedCountry}
                onChange={(event) => setSelectedCountry(event.target.value)}
                aria-label="ニュースを表示する国"
              >
                <option value="random">地域からランダム</option>
                {availableCountries.map((country) => (
                  <option key={country} value={country}>{countryNames[country] || country.toUpperCase()}</option>
                ))}
              </select>
              <small>国を固定するか、選択した地域から偶然の1か国を探せます。</small>
            </label>
          )}
          <button className="shuffle-button" onClick={() => void fetchNews()} disabled={loading}>
            <span className="shuffle-icon">↻</span>
            <span>
              {loading
                ? "世界を探しています…"
                : exploreMode === "single" && selectedCountry !== "random"
                  ? `${countryNames[selectedCountry] || selectedCountry.toUpperCase()}の記事を見る`
                  : "世界をシャッフル"}
            </span>
            <span className="button-arrow">→</span>
          </button>
          <p className="quota-note">
            {exploreMode === "mix"
              ? "1回で最大5か国・10件をミックス"
              : "選択した1カ国の記事だけを最大10件表示"}
          </p>
        </div>

        <div className="orbit-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <GlobeVisual coordinates={coordinates} label={locationLabel} rotating={exploreMode === "mix"} />
          <div className="location-chip">NOW EXPLORING<br /><b>{locationLabel}</b></div>
          <div className="signal-card"><i /><span>CONNECTED</span><b>GLOBAL</b></div>
        </div>
      </section>

      <section ref={newsListTopRef} className="feed-section" aria-live="polite">
        <div className="feed-heading">
          <div>
            <span className="section-number">01</span>
            <h2>今日の偶然</h2>
          </div>
          <div className="feed-meta">
            <span>{categoryLabel}</span>
            <label className="sort-control">
              <span>表示順</span>
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value)}
              >
                {sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <span>{orderedArticles.length ? `${orderedArticles.length}件` : "—件"}</span>
          </div>
        </div>
        {!loading && orderedArticles.length ? pageNavigation("top") : null}
        {!loading && exploreMode === "mix" && pickedCountries.length > 0 && (
          <div className="mix-country-list">
            <span>SELECTED COUNTRIES</span>
            <div>
              {pickedCountries.map((country) => (
                <b key={country}>{countryNames[country] || country.toUpperCase()}</b>
              ))}
            </div>
          </div>
        )}
        {pageError && (
          <div className="page-error page-error-top" role="status">
            <b>{errorHeading(pageError.code)}</b><span>{pageError.message}</span>
          </div>
        )}
        <p className="feed-safety-note">
          配信元が提供したタイトルと短い概要を掲載しています。記事全文は転載していません。
        </p>

        {loading ? (
          <div className="news-card loading-card">
            <div className="loading-visual"><i /><span>SCANNING THE GLOBE</span></div>
            <div className="loading-lines"><i /><i /><i /><i /></div>
          </div>
        ) : error ? (
          <div className="error-card" role="alert">
            <span>{error.code === "CONFIGURATION" ? "SETUP REQUIRED" : "CONNECTION PAUSED"}</span>
            <h3>{errorHeading(error.code)}</h3>
            <p>{error.message}</p>
            {error.retryAfterSeconds ? (
              <small>再試行の目安: 約{error.retryAfterSeconds}秒後</small>
            ) : null}
            {error.code !== "CONFIGURATION" && (
              <button onClick={() => void fetchNews()}>
                {error.code === "NO_RESULTS" ? "条件を変えて探す" : "もう一度試す"} ↻
              </button>
            )}
          </div>
        ) : orderedArticles.length ? (
          <>
            {translationEnabled && translationError && (
              <div className="translation-error translation-error-list">{translationError}</div>
            )}
            <div className="news-grid">
              {orderedArticles.map((article, articleIndex) => {
                const countryCode = articleCountryCode(article, pickedCountry, exploreMode);
                const cardLocationLabel = countryNames[countryCode] || countryCode.toUpperCase();
                const translationKey = `${article.id}:${targetLanguage}`;
                const translated = translationCache[translationKey];
                const isTranslating = translationEnabled && translationLoading && !translated;
                const shownTitle = translationEnabled && translated ? translated.title : article.title;
                const shownDescription = translationEnabled && translated
                  ? translated.description
                  : article.description;

                return (
                  <article className="news-card news-list-card" key={article.id}>
                    <span className="card-number">{String(articleIndex + 1).padStart(2, "0")}</span>
                    <div className="news-visual"><ArticleImage article={article} /></div>
                    <div className="news-content">
                      <div className="article-tags">
                        <span>{cardLocationLabel}</span>
                        <span>{article.category?.[0] || "world"}</span>
                        {translationEnabled && (
                          <span className="translation-tag">
                            {isTranslating ? "翻訳中…" : translated ? "DEEPL訳" : "原文"}
                          </span>
                        )}
                      </div>
                      <h3 className={isTranslating ? "is-translating" : ""}>{shownTitle}</h3>
                      <p>{shownDescription || "記事の詳しい内容は、配信元のページで読むことができます。"}</p>
                      <div className="article-source">
                        <div>
                          <span>SOURCE</span>
                          <strong>{article.source}</strong>
                        </div>
                        <div>
                          <span>PUBLISHED</span>
                          <strong>{formatDate(article.publishedAt)}</strong>
                        </div>
                      </div>
                      <div className="article-actions">
                        <button className="read-here-button" onClick={() => setReaderArticleId(article.id)}>
                          サイト内で概要を読む <span>→</span>
                        </button>
                        <button className="share-button" onClick={() => void shareArticle(article)} aria-label="記事を共有">
                          {copiedId === article.id ? "コピー済み" : "共有"} ↗
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            {pageNavigation("bottom")}
          </>
        ) : null}
      </section>

      {readerArticle && (
        <div className="reader-backdrop" onMouseDown={() => setReaderArticleId(null)}>
          <article
            className="reader-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reader-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button className="reader-close" onClick={() => setReaderArticleId(null)} aria-label="詳細を閉じる">×</button>
            <div className="reader-kicker"><span>TERRANDIP READER</span><span>SHORT SUMMARY</span></div>
            <h3 id="reader-title">{readerTitle}</h3>
            <div className="reader-meta">
              <div><span>SOURCE</span><strong>{readerArticle.source}</strong></div>
              <div><span>PUBLISHED</span><strong>{formatDate(readerArticle.publishedAt)}</strong></div>
              {translationEnabled && readerTranslation && <b>DEEPL訳</b>}
            </div>
            <div className="reader-summary">
              <span>配信元提供の概要</span>
              <p>{readerDescription || "このニュースには、配信元から概要が提供されていません。"}</p>
            </div>
            <div className="reader-notice">
              <b>著作権に配慮した表示</b>
              <p>この画面では記事全文を複製せず、提供された短い概要だけを表示しています。</p>
            </div>
            <div className="reader-actions">
              <button onClick={() => void shareArticle(readerArticle)}>
                {copiedId === readerArticle.id ? "リンクをコピーしました" : "記事リンクを共有"}
              </button>
              <a href={readerArticle.url} target="_blank" rel="noopener noreferrer">
                配信元で原文を確認 <span>↗</span>
              </a>
            </div>
          </article>
        </div>
      )}

      {accountOpen && <AccountPanel onClose={() => setAccountOpen(false)} />}

      <section className="manifesto">
        <span className="section-number">02</span>
        <p>いつもの視点から、<br /><em>少しだけ遠くへ。</em></p>
        <div className="manifesto-note">
          <b>TERRANDIP</b>
          <span>偏りのない世界はない。<br />だからこそ、偶然の入口を。</span>
        </div>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top"><span className="brand-mark">T</span><span>TERRANDIP</span></a>
        <p>NEWS: NEWSDATA.IO · TRANSLATION: DEEPL</p>
        <p>© 2026 TERRANDIP</p>
      </footer>
    </main>
  );
}
