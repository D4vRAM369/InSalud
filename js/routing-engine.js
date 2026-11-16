// =====================================================
// InSalud — Motor de Enrutamiento Institucional (Gran Canaria)
// Normativa: Decreto 8/2025 (BOC n.º 43) y Ley 39/2015
// Módulo puro compatible con navegador y Node.js (tests).
// =====================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.InSaludRouting = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const OFFICIAL_CHANNELS = {
    SCS_RECLAMACION: {
      id: 'scs_1768',
      dbCode: 'scs_3831',
      name: 'Servicio Canario de la Salud (SCS) / ODDUS — Reclamación en el ámbito sanitario',
      procedureCode: 'Trámite 1768',
      url: 'https://sede.gobiernodecanarias.org/sede/tramites/1768',
      deadline: 'Plazo máximo legal de respuesta: 2 meses (Decreto 8/2025).',
      authMethod: 'Cl@ve, DNIe o Certificado Digital en Sede Electrónica oficial.'
    },
    ODDUS_DISCONFORMIDAD: {
      id: 'oddus_6465',
      dbCode: 'oddus_3832',
      name: 'ODDUS (Oficina de Defensa de los Derechos de las Personas Usuarias Sanitarias) — Disconformidades',
      procedureCode: 'Trámite 6465',
      url: 'https://sede.gobiernodecanarias.org/sede/tramites/6465',
      address: 'Av. Juan XXIII, 17, 35004 Las Palmas de Gran Canaria',
      phones: '928 11 88 51 / 928 11 88 70',
      email: 'oddus.sanidad@gobiernodecanarias.org',
      deadline: 'Plazo para presentar disconformidad: 1 mes desde la respuesta. Resolución definitiva en 2 meses.',
      authMethod: 'Cl@ve, DNIe o Certificado Digital en Sede Electrónica oficial.'
    },
    SCS_RESPONSABILIDAD_PATRIMONIAL: {
      id: 'scs_1817',
      dbCode: 'scs_1817',
      name: 'SCS / Consejería de Sanidad — Responsabilidad Patrimonial',
      procedureCode: 'Trámite 1817',
      url: 'https://sede.gobiernodecanarias.org/sede/tramites/1817',
      deadline: 'Procedimiento específico para indemnización por daños o secuelas asistenciales.',
      authMethod: 'Cl@ve, DNIe o Certificado Digital en Sede Electrónica oficial.'
    },
    DEFENSOR_PACIENTE: {
      id: 'defensor_paciente',
      name: 'Asociación El Defensor del Paciente (Canarias / Nacional)',
      procedureCode: 'Valoración Jurídica / Denuncia',
      url: 'https://www.negligenciasmedicas.com',
      email: 'defensorpaciente@telefonica.net',
      phones: '+34 910 55 19 42',
      deadline: 'Envío de escrito y documentación médica para valoración por equipo jurídico sanitario.',
      authMethod: 'Web oficial o correo electrónico con documentación adjunta.'
    },
    DIPUTADO_COMUN: {
      id: 'diputado_comun',
      name: 'Diputado del Común (Defensor del Pueblo en Canarias)',
      procedureCode: 'Queja Ciudadana',
      url: 'https://www.diputadodelcomun.com',
      deadline: 'Supervisión parlamentaria ante silencio administrativo o vulneración reiterada de derechos.',
      authMethod: 'Sede Electrónica del Diputado del Común o registro escrito.'
    }
  };

  function resolveComplaintRoute(input = {}) {
    const category = String(input.category || '');
    const priorStatus = input.priorComplaintStatus || 'none';
    const hasPhysicalHarm = Boolean(input.hasPhysicalHarm);

    const secondaryChannels = [];
    let primary = OFFICIAL_CHANNELS.SCS_RECLAMACION;
    let legalBasis = [
      'Decreto 8/2025, de 24 de febrero (BOC n.º 43), regulador de reclamaciones sanitarias y la ODDUS en Canarias.',
      'Ley 39/2015 del Procedimiento Administrativo Común de las Administraciones Públicas.',
      'Ley 41/2002 básica reguladora de la autonomía del paciente.'
    ];

    if (priorStatus === 'empty_response' || priorStatus === 'no_response_2m') {
      primary = OFFICIAL_CHANNELS.ODDUS_DISCONFORMIDAD;
      secondaryChannels.push(OFFICIAL_CHANNELS.DIPUTADO_COMUN);
      if (hasPhysicalHarm) {
        secondaryChannels.push(OFFICIAL_CHANNELS.SCS_RESPONSABILIDAD_PATRIMONIAL);
        secondaryChannels.push(OFFICIAL_CHANNELS.DEFENSOR_PACIENTE);
      }
      legalBasis.unshift(
        priorStatus === 'no_response_2m'
          ? 'Incumplimiento del plazo máximo de 2 meses de respuesta establecido en el Decreto 8/2025.'
          : 'Escrito de disconformidad ante contestación genérica o no motivada (Decreto 8/2025).'
      );
    } else if (hasPhysicalHarm) {
      primary = OFFICIAL_CHANNELS.SCS_RECLAMACION;
      secondaryChannels.push(OFFICIAL_CHANNELS.SCS_RESPONSABILIDAD_PATRIMONIAL);
      secondaryChannels.push(OFFICIAL_CHANNELS.DEFENSOR_PACIENTE);
      secondaryChannels.push(OFFICIAL_CHANNELS.ODDUS_DISCONFORMIDAD);
    } else {
      primary = OFFICIAL_CHANNELS.SCS_RECLAMACION;
      secondaryChannels.push(OFFICIAL_CHANNELS.ODDUS_DISCONFORMIDAD);
      if (category === 'Retrasos y listas de espera' || category === 'Urgencias no atendidas') {
        secondaryChannels.push(OFFICIAL_CHANNELS.DEFENSOR_PACIENTE);
      }
      secondaryChannels.push(OFFICIAL_CHANNELS.DIPUTADO_COMUN);
    }

    return {
      primary,
      secondaryChannels,
      legalBasis,
      zeroPiiNotice: 'InSalud no recopila ni almacena tu DNI, certificado digital ni Cl@ve. La firma se realiza directamente en la web oficial.'
    };
  }

  function buildFormalComplaintText(data = {}) {
    const route = data.route || resolveComplaintRoute(data);
    const center = (data.center || 'Centro sanitario no especificado').trim();
    const category = (data.category || 'Categoría no especificada').trim();
    const incidentDate = (data.incidentDate || 'Fecha no especificada').trim();
    const description = (data.description || '').trim();
    const measures = Array.isArray(data.requestedMeasures) && data.requestedMeasures.length > 0
      ? data.requestedMeasures
      : [
          'Se admita a trámite el presente escrito y se investiguen de forma efectiva los hechos expuestos.',
          'Se emita respuesta escrita motivada punto por punto dentro del plazo máximo legal de 2 meses (Decreto 8/2025), evitando contestaciones genéricas.',
          'Se adopten las medidas organizativas o correctoras oportunas para evitar su repetición.'
        ];

    const claimantName = (data.claimantName || '').trim();
    const claimantDni = (data.claimantDni || '').trim();
    const headerIdentity = claimantName || claimantDni
      ? `PERSONA RECLAMANTE:\n- Nombre y apellidos: ${claimantName || '___________________________'}\n- DNI / NIE: ${claimantDni || '_________________'}\n\n`
      : '';

    const todayStr = new Date().toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const measuresBlock = measures.map((item, idx) => `${idx + 1}. ${item}`).join('\n');
    const legalBlock = route.legalBasis.map(item => `- ${item}`).join('\n');

    return `ESCRITO DE RECLAMACIÓN / SOLICITUD FORMAL EN EL ÁMBITO SANITARIO
==================================================================
DESTINATARIO PRINCIPAL:
${route.primary.name} (${route.primary.procedureCode})
Portal oficial: ${route.primary.url}

${headerIdentity}DATOS DEL CENTRO Y HECHOS:
- Centro / Hospital afectado: ${center}
- Categoría de la incidencia: ${category}
- Fecha de la incidencia: ${incidentDate}

EXPONE:
Que formula reclamación formal en relación con los hechos ocurridos en el centro indicado:

${description}

FUNDAMENTOS DE DERECHO:
${legalBlock}

SOLICITA (MEDIDAS CONCRETAS):
${measuresBlock}

DOCUMENTACIÓN ADJUNTA:
- [Indicar aquí informes médicos, volantes, justificantes de cita o capturas aportadas en el registro oficial]

En Gran Canaria, a ${todayStr}.

Firma (o presentación electrónica mediante Cl@ve / DNIe / Certificado Digital):
___________________________
`;
  }

  function formatRouteForSpeech(data = {}) {
    const route = data.route || resolveComplaintRoute(data);
    const center = (data.center || 'el centro sanitario').trim();
    const measures = Array.isArray(data.requestedMeasures) && data.requestedMeasures.length > 0
      ? data.requestedMeasures.join('. ')
      : 'solicitar una respuesta escrita motivada y medidas correctoras.';

    let routePhrase = 'el trámite mil setecientos sesenta y ocho de reclamación sanitaria en la Sede Electrónica del Gobierno de Canarias. La administración tiene un plazo máximo legal de dos meses para responderte por escrito.';
    if (route.primary.id === 'oddus_6465') {
      routePhrase = 'el trámite seis mil cuatrocientos sesenta y cinco de disconformidades ante la ODDUS, la Oficina de Defensa de los Derechos de los Usuarios Sanitarios, porque ya recibiste una respuesta vacía o pasaron dos meses sin contestación.';
    }
    const harmPhrase = data.hasPhysicalHarm
      ? ' Además, al haber daño físico o secuelas, te recomendamos valorar el trámite de responsabilidad patrimonial y contactar con la Asociación El Defensor del Paciente.'
      : '';

    return `Resumen de tu trámite en InSalud para ${center}. La ruta recomendada es ${routePhrase}${harmPhrase} Las medidas concretas que solicitas son: ${measures}. Recuerda que InSalud no guarda tu DNI ni tu Cl@ve; al pulsar el botón oficial, firmarás directamente en la web del Gobierno de Canarias.`;
  }

  return {
    OFFICIAL_CHANNELS,
    resolveComplaintRoute,
    buildFormalComplaintText,
    formatRouteForSpeech
  };
});
