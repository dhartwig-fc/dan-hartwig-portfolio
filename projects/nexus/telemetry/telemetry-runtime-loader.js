"use strict";

(() => {
    const PAYLOAD_PATH = "telemetry-runtime-state.json";
    const FIELD_ATTRIBUTE = "data-telemetry-field";

    function formatValue(value) {
        if (value === null || value === undefined || value === "") {
            return "UNAVAILABLE";
        }

        if (typeof value === "boolean") {
            return value ? "TRUE" : "FALSE";
        }

        return String(value);
    }

    function setDocumentState(state, message) {
        const root = document.documentElement;

        root.setAttribute(
            "data-telemetry-runtime-state",
            state
        );

        if (message) {
            root.setAttribute(
                "data-telemetry-runtime-message",
                message
            );
        } else {
            root.removeAttribute(
                "data-telemetry-runtime-message"
            );
        }
    }

    function bindProjection(projection) {
        const elements = document.querySelectorAll(
            `[${FIELD_ATTRIBUTE}]`
        );

        let boundCount = 0;

        elements.forEach((element) => {
            const field = element.getAttribute(
                FIELD_ATTRIBUTE
            );

            if (!field) {
                return;
            }

            if (!Object.prototype.hasOwnProperty.call(
                projection,
                field
            )) {
                element.setAttribute(
                    "data-telemetry-binding-status",
                    "missing"
                );
                return;
            }

            element.textContent = formatValue(
                projection[field]
            );

            element.setAttribute(
                "data-telemetry-binding-status",
                "bound"
            );

            boundCount += 1;
        });

        return {
            discoveredCount: elements.length,
            boundCount,
        };
    }

  function bindOperationalIdentity(payload) {
    const fields = {
      "Last Validation": payload.last_validation,
      "Active Stage": payload.active_stage,
      "Current Branch": payload.current_branch,
      "Current Commit": payload.current_commit,
      "Build Fingerprint": payload.build_fingerprint
    };

    const rows = document.querySelectorAll(
      ".stage427a6-detail-row"
    );

    let boundCount = 0;

    rows.forEach((row) => {
      const labelElement = row.querySelector(
        ".stage427a6-detail-label"
      );

      const valueElement = row.querySelector(
        ".stage427a6-detail-value"
      );

      if (!labelElement || !valueElement) {
        return;
      }

      const label = labelElement.textContent.trim();

      if (!Object.prototype.hasOwnProperty.call(
        fields,
        label
      )) {
        return;
      }

      valueElement.textContent = formatValue(
        fields[label]
      );

      valueElement.setAttribute(
        "data-telemetry-identity-field",
        label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")
      );

      boundCount += 1;
    });

    document.documentElement.setAttribute(
      "data-telemetry-identity-bound-count",
      String(boundCount)
    );

    return boundCount;
  }




  function bindLiveManufacturing(payload) {
    const live = payload.live_manufacturing;

    if (!live || typeof live !== "object") {
      throw new Error(
        "Live manufacturing telemetry is missing or invalid"
      );
    }

    const pipeline = live.pipeline || {};
    const execution = live.current_execution || {};
    const validation = live.validation || {};
    const evidence = live.evidence || {};

    const projection = {
      pipeline_status: pipeline.status,
      pipeline_progress_percent: pipeline.progress_percent,
      pipeline_step_count: pipeline.step_count,
      pipeline_steps_completed: pipeline.steps_completed,
      pipeline_steps_failed: pipeline.steps_failed,
      pipeline_duration_ms: pipeline.duration_ms,
      current_stage: execution.stage,
      current_activity: execution.activity,
      runtime_event_count: execution.runtime_event_count,
      active_validator: validation.active_validator,
      validation_checks_passed: validation.checks_passed,
      validation_checks_failed: validation.checks_failed,
      validation_check_total: validation.check_total,
      validation_progress_percent: validation.progress_percent,
      evidence_items_captured: evidence.items_captured
    };

    return bindProjection(projection);
  }

  async function loadTelemetry() {
        setDocumentState("loading");

        try {
            const response = await fetch(
                PAYLOAD_PATH,
                {
                    cache: "no-store",
                    credentials: "same-origin",
                }
            );

            if (!response.ok) {
                throw new Error(
                    `Payload request failed: ${response.status}`
                );
            }

            const payload = await response.json();

            if (
                !payload ||
                typeof payload !== "object" ||
                !payload.projection ||
                typeof payload.projection !== "object"
            ) {
                throw new Error(
                    "Telemetry projection is missing or invalid"
                );
            }

            const result = bindProjection(
                payload.projection
            );

      const identityBoundCount = bindOperationalIdentity(payload);
      const liveManufacturingBoundCount = bindLiveManufacturing(payload);


            document.documentElement.setAttribute(
                "data-telemetry-run-id",
                formatValue(payload.run_id)
            );

            document.documentElement.setAttribute(
                "data-telemetry-product-id",
                formatValue(payload.product_id)
            );

            document.documentElement.setAttribute(
                "data-telemetry-bound-count",
                String(result.boundCount)
            );

            document.documentElement.setAttribute(
                "data-telemetry-discovered-count",
                String(result.discoveredCount)
            );

            setDocumentState("loaded");
        } catch (error) {
            console.error(
                "Enterprise telemetry load failed.",
                error
            );

            setDocumentState(
                "error",
                error instanceof Error
                    ? error.message
                    : String(error)
            );
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            loadTelemetry,
            { once: true }
        );
    } else {
        loadTelemetry();
    }
})();
/* FC10_STAGE327D_RUNTIME_TELEMETRY_CONSUMPTION_BEGIN */
(function () {
    "use strict";

    var FC10_RUNTIME_STATE_URL = "./telemetry-runtime-state.json";

    function fc10RequireObject(value, name) {
        if (
            value === null ||
            typeof value !== "object" ||
            Array.isArray(value)
        ) {
            throw new Error(
                "FC10 telemetry contract violation: "
                + name
                + " must be an object"
            );
        }

        return value;
    }

    function fc10PublishRuntimeTelemetry(state) {
        var projectionMetadata = fc10RequireObject(
            state.projection_metadata,
            "projection_metadata"
        );

        var runtimeProjection = fc10RequireObject(
            state.runtime_projection,
            "runtime_projection"
        );

        var detail = Object.freeze({
            projection_metadata: Object.freeze(
                Object.assign({}, projectionMetadata)
            ),
            runtime_projection: Object.freeze(
                Object.assign({}, runtimeProjection)
            ),
            source: Object.freeze({
                path: FC10_RUNTIME_STATE_URL,
                read_only: true
            })
        });

        window.dispatchEvent(
            new CustomEvent(
                "fc10:runtime-telemetry-ready",
                { detail: detail }
            )
        );
    }

    function fc10FailClosed(error) {
        window.dispatchEvent(
            new CustomEvent(
                "fc10:runtime-telemetry-failed",
                {
                    detail: Object.freeze({
                        message: String(
                            error && error.message
                                ? error.message
                                : error
                        ),
                        fail_closed: true
                    })
                }
            )
        );

        throw error;
    }

    function fc10ConsumeRuntimeTelemetry() {
        return fetch(
            FC10_RUNTIME_STATE_URL,
            {
                method: "GET",
                credentials: "same-origin",
                cache: "no-store",
                headers: {
                    "Accept": "application/json"
                }
            }
        )
        .then(function (response) {
            if (!response.ok) {
                throw new Error(
                    "FC10 telemetry state request failed: "
                    + response.status
                );
            }

            return response.json();
        })
        .then(function (state) {
            fc10RequireObject(
                state,
                "telemetry runtime state"
            );

            fc10PublishRuntimeTelemetry(state);

            return true;
        })
        .catch(fc10FailClosed);
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            fc10ConsumeRuntimeTelemetry,
            { once: true }
        );
    } else {
        fc10ConsumeRuntimeTelemetry();
    }
}());
/* FC10_STAGE327D_RUNTIME_TELEMETRY_CONSUMPTION_END */
