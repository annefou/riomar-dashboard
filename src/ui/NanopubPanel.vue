<script lang="ts" setup>
/**
 * Nanopublications of the FDO, grouped by the template they were created
 * from (claims, and any other kind). Each row opens the nanopub in a wide
 * overlay rendered by the Science Live embed, so only the nanopub being
 * read is loaded.
 */
import { onKeyStroke } from "@vueuse/core";
import { computed, ref, watch } from "vue";

import type { NanopubEmbedStyle, NanopubItem } from "@/lib/data/nanopubs";
import { fetchNanopubTemplates } from "@/lib/data/nanopubs";
import NanopubEmbed from "@/ui/NanopubEmbed.vue";

const props = withDefaults(
  defineProps<{
    nanopubs: NanopubItem[];
    embedStyle?: NanopubEmbedStyle;
  }>(),
  { embedStyle: () => ({}) }
);

const items = ref<NanopubItem[]>(props.nanopubs);
const isOpen = ref(false);
const selected = ref<NanopubItem | null>(null);

watch(
  () => props.nanopubs,
  async (nanopubs) => {
    items.value = nanopubs;
    try {
      items.value = await fetchNanopubTemplates(nanopubs);
    } catch (e) {
      console.error("[Nanopubs] Template lookup failed:", e);
    }
  },
  { immediate: true }
);

// Templates labels read like "AIDA Sentence: Expressing a statement ...";
// keep the part before the colon as the group name.
function groupName(item: NanopubItem): string {
  return item.templateLabel?.split(":")[0].trim() || "Other nanopublications";
}

const groups = computed(() => {
  const byName = new Map<string, NanopubItem[]>();
  for (const item of items.value) {
    const name = groupName(item);
    byName.set(name, [...(byName.get(name) ?? []), item]);
  }
  return [...byName.entries()].map(([name, groupItems]) => ({
    name,
    items: groupItems,
  }));
});

onKeyStroke("Escape", () => {
  selected.value = null;
});
</script>

<template>
  <div v-if="items.length > 0" class="nanopub-panel" :class="{ open: isOpen }">
    <button type="button" class="panel-toggle" @click="isOpen = !isOpen">
      Nanopublications ({{ items.length }})
      <span>{{ isOpen ? "▾" : "▴" }}</span>
    </button>

    <div v-if="isOpen" class="panel-body">
      <section v-for="group in groups" :key="group.name" class="group">
        <h3>{{ group.name }} ({{ group.items.length }})</h3>
        <button
          v-for="item in group.items"
          :key="item.code"
          type="button"
          class="row"
          :title="item.label ?? item.name"
          @click="selected = item"
        >
          {{ item.name ?? item.label ?? item.code }}
        </button>
      </section>
    </div>
  </div>

  <div v-if="selected" class="overlay" @click.self="selected = null">
    <div class="overlay-card">
      <button
        type="button"
        class="overlay-close"
        title="Close"
        @click="selected = null"
      >
        &times;
      </button>
      <NanopubEmbed :uri="selected.uri" :embed-style="embedStyle" />
    </div>
  </div>
</template>

<style scoped>
.nanopub-panel {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: min(900px, 70vw);
  z-index: 1000;
  background: rgba(20, 20, 20, 0.92);
  color: #e0e0e0;
  border-radius: 8px 8px 0 0;
  backdrop-filter: blur(10px);
}

.panel-toggle {
  width: 100%;
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  border: none;
  background: none;
  color: white;
  font-weight: 700;
  cursor: pointer;
}

.panel-body {
  max-height: 40vh;
  overflow-y: auto;
  padding: 0 1rem 1rem;
}

.group h3 {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #999;
  margin: 0.8rem 0 0.4rem;
}

.row {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.4rem 0.6rem;
  margin-bottom: 0.3rem;
  border: none;
  border-left: 3px solid rgba(74, 144, 217, 0.5);
  background: rgba(255, 255, 255, 0.04);
  color: #e0e0e0;
  font-size: 0.9rem;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row:hover {
  background: rgba(255, 255, 255, 0.1);
}

.overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
}

.overlay-card {
  position: relative;
  width: min(900px, 92vw);
  max-height: 85vh;
  overflow-y: auto;
  border-radius: 8px;
}

.overlay-close {
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
  z-index: 1;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: rgba(30, 30, 30, 0.9);
  color: white;
  font-size: 1.3rem;
  cursor: pointer;
}
</style>
