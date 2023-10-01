import { Config, EntityConfigInternal } from "./types";

export function filterConfigByZoomEntity(config: Config, zoomEntity?: EntityConfigInternal) {
    if (!zoomEntity) {
        return config;
    }
    let children: string[] = [];
    const newSections = config.sections.map(section => {
        const newEntities = section.entities.filter(entity => entity === zoomEntity || children.includes(entity.entity_id));
        children = newEntities.flatMap(entity => entity.children);
        return {
            ...section,
            entities: newEntities,
        };
    }).filter(section => section.entities.length > 0);

    return {
        ...config,
        sections: newSections,
    };
}