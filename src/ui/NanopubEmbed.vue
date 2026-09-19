<script lang="ts" setup>
/**
 * Display one nanopublication with Science Live's embeddable viewer
 * (/embed/view), which picks the view matching the nanopub's template.
 * The embed reports its content height via postMessage, so the iframe
 * follows its content instead of having a fixed height.
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import type { NanopubEmbedStyle } from "@/lib/data/nanopubs";
import { resolvableNanopubUri } from "@/lib/data/nanopubs";

const props = withDefaults(
  defineProps<{
    uri: string;
    // Style set by the dashboard creator; unset values keep the Science Live default
    embedStyle?: NanopubEmbedStyle;
  }>(),
  { embedStyle: () => ({}) }
);

const EMBED_URL =
  import.meta.env.VITE_SCIENCELIVE_EMBED_URL ??
  "https://platform.sciencelive4all.org/embed/view";

const src = computed(() => {
  const params = new URLSearchParams({
    uri: resolvableNanopubUri(props.uri),
    showShare: "false",
    showCitation: "false",
    showReferences: "false",
  });
  for (const [key, value] of Object.entries(props.embedStyle)) {
    if (value) {
      params.set(key, value);
    }
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
