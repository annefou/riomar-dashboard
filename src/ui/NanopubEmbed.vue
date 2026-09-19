<script lang="ts" setup>
/**
 * Display one nanopublication with Science Live's embeddable viewer
 * (/embed/view), which picks the view matching the nanopub's template.
 * The embed reports its content height via postMessage, so the iframe
 * follows its content instead of having a fixed height.
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const props = withDefaults(
  defineProps<{
    uri: string;
    theme?: "light" | "dark";
    primaryColor?: string;
    bgColor?: string;
  }>(),
  {
    theme: "dark",
    primaryColor: undefined,
    bgColor: undefined,
  }
);

const EMBED_URL =
  import.meta.env.VITE_SCIENCELIVE_EMBED_URL ??
  "https://platform.sciencelive4all.org/embed/view";

// Science Live mints nanopubs under w3id.org/sciencelive/np/, which does not
// serve RDF; the same nanopub is served as RDF under w3id.org/np/.
function toResolvableUri(uri: string): string {
  const code = uri.match(/\/(RA[A-Za-z0-9_-]{43})/)?.[1];
  return code ? `https://w3id.org/np/${code}` : uri;
}

const src = computed(() => {
  const params = new URLSearchParams({
    uri: toResolvableUri(props.uri),
    theme: props.theme,
    showShare: "false",
    showCitation: "false",
    showReferences: "false",
  });
  if (props.primaryColor) {
    params.set("primaryColor", props.primaryColor.replace("#", ""));
  }
  if (props.bgColor) {
    params.set("bgColor", props.bgColor.replace("#", ""));
  }
  return `${EMBED_URL}?${params}`;
});

const iframe = ref<HTMLIFrameElement | null>(null);
const height = ref(160);
const embedOrigin = new URL(EMBED_URL).origin;

function onMessage(event: MessageEvent) {
  if (
    event.origin !== embedOrigin ||
    event.source !== iframe.value?.contentWindow ||
    event.data?.type !== "nanopub-embed-resize"
  ) {
    return;
  }
  height.value = Number(event.data.height) || height.value;
}

onMounted(() => window.addEventListener("message", onMessage));
onBeforeUnmount(() => window.removeEventListener("message", onMessage));
</script>

<template>
  <iframe
    ref="iframe"
    :src="src"
    :style="{ height: `${height}px` }"
    class="nanopub-embed"
    loading="lazy"
    title="Nanopublication"
  ></iframe>
</template>

<style scoped>
.nanopub-embed {
  display: block;
  width: 100%;
  border: none;
  border-radius: 8px;
  background: transparent;
}
</style>
