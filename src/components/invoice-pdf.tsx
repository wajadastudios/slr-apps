import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";

const STATUS_LABEL: Record<string, string> = {
  sent: "Menunggu Pembayaran",
  paid: "Lunas",
};

const STATUS_COLOR: Record<string, { text: string; bg: string }> = {
  sent: { text: "#b45309", bg: "#fef3c7" },
  paid: { text: "#1a8f6f", bg: "#dcfce7" },
};

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#17263D",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  logo: { width: 130, height: 130 },
  contact: { fontSize: 9, color: "#64748b", textAlign: "right", lineHeight: 1.5 },
  divider: { borderBottom: "2 solid #17263D", marginBottom: 20 },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 3 },
  subtitle: { fontSize: 10, color: "#64748b" },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
  },
  statusPillText: { fontSize: 9, fontWeight: 700 },
  infoRow: {
    flexDirection: "row",
    marginBottom: 24,
    border: "1 solid #e2e8f0",
    borderRadius: 4,
  },
  infoCol: {
    flex: 1,
    padding: 12,
    borderLeft: "1 solid #e2e8f0",
  },
  infoColFirst: { borderLeft: "none" },
  infoLabel: {
    fontSize: 8,
    color: "#94a3b8",
    textTransform: "uppercase",
    marginBottom: 5,
    letterSpacing: 0.5,
  },
  infoValue: { fontSize: 11, fontWeight: 700, marginBottom: 3 },
  infoSub: { fontSize: 9, color: "#64748b" },
  table: {
    border: "1 solid #e2e8f0",
    borderRadius: 4,
    overflow: "hidden",
  },
  tableHead: {
    flexDirection: "row",
    backgroundColor: "#17263D",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderTop: "1 solid #e2e8f0",
  },
  colProgram: { flex: 3 },
  colSesi: { flex: 1, textAlign: "center" },
  colPeriode: { flex: 1.2, textAlign: "center" },
  colTotal: { flex: 1.5, textAlign: "right" },
  tableHeadText: {
    fontSize: 8,
    color: "#ffffff",
    textTransform: "uppercase",
    fontWeight: 700,
    letterSpacing: 0.5,
  },
  totalBlock: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 14,
  },
  totalBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
    backgroundColor: "#f0fdf9",
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  totalLabel: { fontSize: 11, fontWeight: 700, color: "#17263D" },
  totalValue: { fontSize: 18, fontWeight: 700, color: "#1a8f6f" },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 40,
    right: 40,
    fontSize: 9,
    color: "#94a3b8",
    textAlign: "center",
  },
});

function formatRupiah(amount: number) {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

export function InvoicePdf({
  logoUrl,
  address,
  phone,
  email,
  invoiceNumber,
  status,
  sentAt,
  studentName,
  parentName,
  packageName,
  createdAt,
  sessionsCount,
  amount,
  basePrice,
  discountAmount,
}: {
  logoUrl: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  invoiceNumber: string;
  status: string;
  sentAt: string | null;
  studentName: string;
  parentName: string;
  packageName: string;
  createdAt: string | null;
  sessionsCount: number;
  amount: number;
  basePrice?: number | null;
  discountAmount?: number | null;
}) {
  const statusColor = STATUS_COLOR[status] ?? { text: "#17263D", bg: "#f1f5f9" };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image, not an HTML img */}
          <Image src={logoUrl} style={styles.logo} />
          <View style={styles.contact}>
            {address && <Text>{address}</Text>}
            {phone && <Text>{phone}</Text>}
            {email && <Text>{email}</Text>}
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.titleRow}>
          <View>
            <Text style={styles.title}>INVOICE</Text>
            <Text style={styles.subtitle}>Tagihan Program Sari Les Renang</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: statusColor.bg }]}>
            <Text style={[styles.statusPillText, { color: statusColor.text }]}>
              {STATUS_LABEL[status] ?? status}
            </Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <View style={[styles.infoCol, styles.infoColFirst]}>
            <Text style={styles.infoLabel}>Ditagihkan Kepada</Text>
            <Text style={styles.infoValue}>{parentName}</Text>
            <Text style={styles.infoSub}>Siswa: {studentName}</Text>
          </View>
          <View style={styles.infoCol}>
            <Text style={styles.infoLabel}>Nomor Invoice</Text>
            <Text style={styles.infoValue}>{invoiceNumber}</Text>
            <Text style={styles.infoSub}>Terbit: {sentAt ?? "-"}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHead}>
            <Text style={[styles.tableHeadText, styles.colProgram]}>
              Program / Paket
            </Text>
            <Text style={[styles.tableHeadText, styles.colSesi]}>
              Jumlah Sesi
            </Text>
            <Text style={[styles.tableHeadText, styles.colPeriode]}>
              Periode
            </Text>
            <Text style={[styles.tableHeadText, styles.colTotal]}>
              Total Tagihan
            </Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={[styles.colProgram, { fontWeight: 700 }]}>
              {packageName}
            </Text>
            <Text style={styles.colSesi}>{sessionsCount} sesi</Text>
            <Text style={styles.colPeriode}>{createdAt ?? "-"}</Text>
            <Text style={[styles.colTotal, { fontWeight: 700 }]}>
              {formatRupiah(amount)}
            </Text>
          </View>
        </View>

        <View style={styles.totalBlock}>
          {basePrice != null && discountAmount != null && discountAmount > 0 && (
            <>
              <View style={styles.totalBox}>
                <Text style={styles.totalLabel}>HARGA DASAR</Text>
                <Text style={styles.totalValue}>{formatRupiah(basePrice)}</Text>
              </View>
              <View style={styles.totalBox}>
                <Text style={styles.totalLabel}>DISKON</Text>
                <Text style={styles.totalValue}>-{formatRupiah(discountAmount)}</Text>
              </View>
            </>
          )}
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>TOTAL TAGIHAN</Text>
            <Text style={styles.totalValue}>{formatRupiah(amount)}</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Invoice ini dibuat otomatis oleh sistem Sari Les Renang. Untuk
          informasi metode pembayaran, hubungi admin.
        </Text>
      </Page>
    </Document>
  );
}
